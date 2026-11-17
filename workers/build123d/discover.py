#!/usr/bin/env python3
"""Discover the installed build123d API and emit the plugin's op catalog.

The catalog is parsed from the real library (SPEC §28): every operation
records its provenance (source package + version) and its palette
placement (the shared semantic palette declaration). Nothing here is
hand-authored per operation — the policy below decides which modules
and signatures are representable, and the installed API supplies the
rest.

Usage: python3 discover.py > catalog.json
"""
import inspect
import json
import sys
from typing import get_args, get_origin, get_type_hints

import build123d
from build123d.topology import Shape

# The authoring surface: build123d's semantic modules. The palette
# section derives from the module an operation is discovered in.
MODULE_GROUPS = {
    "build123d.objects_part": "part",
    "build123d.objects_sketch": "sketch",
    "build123d.objects_curve": "curve",
    "build123d.operations_generic": "operations",
    "build123d.operations_part": "operations",
    "build123d.operations_sketch": "operations",
    "build123d.drafting": "drafting",
    "build123d.text": "text",
}

# The shape-algebra operator protocol: each supported special method on
# Shape becomes one operation. The operand is shape-typed by protocol
# semantics (the installed signatures leave it unannotated).
OPERATOR_PROTOCOL = {
    "__add__": "union",
    "__sub__": "subtract",
    "__and__": "intersect",
}

SCALAR_TYPES = {"number", "boolean", "string"}


def slugify(name):
    return "".join(
        ch if ch.isalnum() else "-" for ch in name.strip().lower()
    ).strip("-")


def annotation_kind(annotation):
    """Classify an annotation into the catalog's param vocabulary.

    `shape` covers single shapes and shape collections (a param typed
    `Shape | Iterable[Shape]` takes one shape value or a list of them).
    """
    import types
    from typing import Union

    if annotation is inspect.Parameter.empty or annotation is None:
        return None
    if annotation is type(None):
        return "none"
    if annotation is bool:
        return "boolean"
    if annotation in (int, float):
        return "number"
    if annotation is str:
        return "string"
    origin = get_origin(annotation)
    if origin is Union or origin is getattr(types, "UnionType", None):
        kinds = {annotation_kind(arg) for arg in get_args(annotation)}
        kinds.discard("none")
        if len(kinds) == 1:
            return kinds.pop()
        if kinds == {"shape", "json"}:
            return "shape"
        return None
    if isinstance(annotation, type):
        if issubclass(annotation, Shape):
            return "shape"
        if issubclass(annotation, (list, tuple, set, frozenset, dict)):
            return "json"
        return None
    if origin is not None:
        args = [arg for arg in get_args(annotation) if arg is not type(None)]
        if len(args) == 1 and annotation_kind(args[0]) == "shape":
            return "shape"
        return "json"
    return None


def hints_of(callable_):
    try:
        return get_type_hints(callable_)
    except Exception:
        return {}


def doc_summary(obj):
    doc = inspect.getdoc(obj) or ""
    return doc.split("Args:")[0].strip()


def params_of(callable_, hints, *, drop_first):
    """Map a signature to catalog params.

    A param with a non-representable annotation is dropped when it
    carries a default (the default applies at dispatch); a required one
    makes the callable inadmissible. Positional variadics make the
    callable inadmissible: the graph wire contract cannot faithfully
    represent positional argument lists. Keyword variadics are ignored.
    """
    try:
        signature = inspect.signature(callable_)
    except (TypeError, ValueError):
        return None, False
    params = []
    for index, item in enumerate(signature.parameters.values()):
        if index == 0 and drop_first:
            continue
        if item.kind == item.VAR_POSITIONAL:
            return None, False
        if item.kind == item.VAR_KEYWORD:
            continue
        kind = annotation_kind(hints.get(item.name, item.annotation))
        has_default = item.default is not inspect.Parameter.empty
        if kind is None:
            if not has_default:
                return None, False
            continue
        param = {"name": item.name, "type": kind, "required": not has_default}
        if (
            has_default
            and kind != "boolean"
            and isinstance(item.default, (int, float, str))
        ):
            param["default"] = item.default
        params.append(param)
    return params, True


def main():
    provenance = {"source": "build123d", "version": build123d.__version__}
    ops = []
    rejected = []

    def emit(*, op_id, kind, label, module, target, params, returns, summary, group=None):
        ops.append({
            "id": op_id,
            "kind": kind,
            "label": label,
            "module": module,
            "target": target,
            "palette": {"group": group or MODULE_GROUPS.get(module, "operations"), "label": {"part": "Parts", "sketch": "Sketches", "curve": "Curves", "operations": "Operations", "drafting": "Drafting", "text": "Text", "algebra": "Algebra"}.get(group or MODULE_GROUPS.get(module, "operations"), "Operations"), "keywords": list(dict.fromkeys([label, op_id, kind, module, *[param["name"] for param in params]]))},
            "params": params,
            "returns": returns,
            "summary": summary,
            "provenance": provenance,
        })

    for module_name in MODULE_GROUPS:
        module = sys.modules.get(module_name) or __import__(module_name, fromlist=["*"])
        for name, obj in vars(module).items():
            if name.startswith("_") or getattr(obj, "__module__", "") != module_name:
                continue
            if inspect.isclass(obj):
                if name in {"BasePartObject", "BaseSketchObject", "BaseCurveObject", "BaseLineObject", "BaseEdgeObject"}:
                    rejected.append(name)
                    continue
                if not (isinstance(obj, type) and issubclass(obj, Shape)):
                    continue
                if inspect.isabstract(obj):
                    continue
                hints = hints_of(obj.__init__)
                params, ok = params_of(obj.__init__, hints, drop_first=True)
                if not ok:
                    rejected.append(name)
                    continue
                emit(
                    op_id=slugify(name),
                    kind="constructor",
                    label=name,
                    module=module_name,
                    target=f"{module_name}:{obj.__qualname__}",
                    params=params,
                    returns="shape",
                    summary=doc_summary(obj),
                )
            elif inspect.isfunction(obj):
                hints = hints_of(obj)
                params, ok = params_of(obj, hints, drop_first=False)
                if not ok:
                    rejected.append(name)
                    continue
                returns = "shape"
                return_hint = hints.get("return")
                if return_hint is not None and annotation_kind(return_hint) not in (None, "shape"):
                    returns = "value"
                emit(
                    op_id=slugify(name),
                    kind="function",
                    label=name,
                    module=module_name,
                    target=f"{module_name}:{obj.__qualname__}",
                    params=params,
                    returns=returns,
                    summary=doc_summary(obj),
                )

    for dunder, semantic in OPERATOR_PROTOCOL.items():
        method = Shape.__dict__.get(dunder)
        if method is None:
            continue
        params = [
            {"name": "shape", "type": "shape", "required": True},
            {"name": "other", "type": "shape", "required": True},
        ]
        emit(
            op_id=semantic,
            kind="operator",
            label=semantic.capitalize(),
            module=Shape.__module__,
            target=f"{Shape.__module__}:{method.__qualname__}",
            params=params,
            returns="shape",
            summary=doc_summary(method),
            group="algebra",
        )

    # Deterministic ids: collisions get a stable numeric suffix and the
    # catalog never silently merges two operations.
    seen = {}
    for op in ops:
        base = op["id"]
        seen[base] = seen.get(base, 0) + 1
        if seen[base] > 1:
            op["id"] = f"{base}-{seen[base]}"

    report = {
        "provenance": provenance,
        "ops": ops,
        "rejected": sorted(set(rejected)),
        "operatorProtocol": OPERATOR_PROTOCOL,
    }
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
