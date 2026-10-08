//! PerigramFacade — one cassette geometry through its whole lifecycle.
//!
//! Visual identity mirrors the app: zinc dark surfaces, IBM Plex Sans/Mono,
//! the Perigram mark (isometric folded cassette, red-orange gradient, with
//! the rotating-core motion from the Rive mark) and the OCCS layer palette
//! from the sheet-design preview styles. A cassette is the OCCS graph tree:
//! a root face, a return flange (+90°) on every edge, mounting-flange lips
//! (−90°) on the side returns, integral-cut hanger clips breaking the top
//! return's outer edge and `cut.hole` bolt circles through the side returns.
//! The flat pattern is the union of those faces (verified against
//! `evaluateOccsCassetteTemplate` ground truth, including the lip-widened
//! contour); the folded piece folds the SAME faces about their junction
//! lines — the face/fold graph algorithm of `buildCassetteV2FoldedPreview`.
//! Scenes hand off seamlessly: template → bake → nest → cut → facade wall.
//! 1920x1080, 30fps.
use fframes::{
    AnimateRuntimeInput, AudioMap, Color, Duration, FFramesContext, FontQuery, Frame, Overlap,
    Scene, Scenes, Svgr, TextOverflow, Transform, Video,
    animation::{AnimationRuntime, Easing},
    include_media_dir,
};
use std::sync::LazyLock;

include_media_dir!(pub struct FacadeVideoMedia, "media");

pub const WIDTH: usize = 1920;
pub const HEIGHT: usize = 1080;
pub const FPS: usize = 30;

/// Scene durations (s), in timeline order — `duration()` and the shared
/// camera push both derive from this list.
pub const DUR_S: [f32; 5] = [2.8, 7.2, 4.6, 5.0, 6.0];
const TOTAL_S: f32 = DUR_S[0] + DUR_S[1] + DUR_S[2] + DUR_S[3] + DUR_S[4];

/// Scene cross-fade window: every scene overlaps the previous one by this
/// many frames. fframes starts an overlapping scene's local time at 0 when
/// the overlap begins, so the incoming scene's fade-in and every
/// "starts when the handoff completes" beat are keyed after it.
pub const CROSS_F: usize = 10;
/// Seconds form of `CROSS_F` for `Overlap::Previous` (fframes truncates it
/// back to `CROSS_F` frames at 30 fps).
pub const CROSS: f32 = 0.35;

// Surfaces — the app's dark theme (zinc scale, assets/tokens).
const BG: &str = "#09090b";
const SURFACE: &str = "#18181b";
const SURFACE_2: &str = "#27272a";
const BORDER: &str = "#3f3f46";
const INK: &str = "#fafafa";
const MUTED: &str = "#a1a1aa";
const GRID: &str = "#141417";
const ACCENT: &str = "#ff0040";

// OCCS layer styles — the sheet-design preview palette.
const CUT: &str = "#dc2626";
const FACE_BLUE: &str = "#2563eb";
const FOLD: &str = "#d97706";
const MARK: &str = "#059669";
const DIMC: &str = "#7c3aed";
const SHEET_LINE: &str = "#64748b";

// IBM Plex — the app's interface and technical faces.
const SANS: &str = "IBM Plex Sans";
const MONO: &str = "IBM Plex Mono";
const W_REG: u16 = 400;
const W_BOLD: u16 = 700;

const EASE_OUT_EXPO: Easing = Easing::CubicBezier(0.16, 1.0, 0.3, 1.0);
const EASE_IN_OUT: Easing = Easing::CubicBezier(0.65, 0.0, 0.35, 1.0);
const SPRING_SOFT: Easing = Easing::Spring { mass: 1.0, stiffness: 150.0, damping: 18.0 };
const SPRING_FOLD: Easing = Easing::Spring { mass: 1.0, stiffness: 120.0, damping: 14.0 };

static RT_EASE_OUT: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.8, &EASE_OUT_EXPO));
static RT_EASE_IN_OUT: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.7, &EASE_IN_OUT));
static RT_SPRING: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(3.0, &SPRING_SOFT));
static RT_FOLD: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(2.4, &SPRING_FOLD));
static RT_FAST: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.3, &Easing::EaseOut));

// ---- cassette model (mm, evaluator frame: face (0,0)-(a,b), y down) ----

/// One cassette variant from the template family. `lip` is the mounting-flange
/// depth on the side returns (0 = none), `bolts` the bolt-hole count per side
/// return, `hangers` the two integral-cut hanger clips on the top return.
struct CassetteSpec {
    id: &'static str,
    a: f32,
    b: f32,
    r: f32,
    lip: f32,
    hangers: bool,
    bolts: usize,
}
const SPECS: [CassetteSpec; 3] = [
    CassetteSpec { id: "PFC-001", a: 300.0, b: 600.0, r: 40.0, lip: 25.0, hangers: true, bolts: 2 },
    CassetteSpec { id: "PFC-002", a: 300.0, b: 900.0, r: 40.0, lip: 25.0, hangers: true, bolts: 3 },
    CassetteSpec { id: "PFC-003", a: 200.0, b: 600.0, r: 30.0, lip: 0.0, hangers: false, bolts: 2 },
];

/// Hanger clip cut, `hangerClipCutPolygon` proportions in mm.
const HANGER_W: f32 = 42.0;
const HANGER_H: f32 = 28.0;
const HANGER_HOOK: f32 = 12.0;
const HANGER_SLOT: f32 = 14.7;
const BOLT_D: f32 = 5.0;

const SHEET_MM: (f32, f32) = (2500.0, 1250.0);
const NESTED: usize = 9;
const EFFICIENCY: f32 = 77.0;

/// Solver-style placements on the sheet, mm from the sheet's top-left; every
/// piece is placed rotated 90° and occupies its rotated bounding box.
struct Placement {
    piece: usize,
    x: f32,
    y: f32,
}
const LAYOUT: [Placement; NESTED] = [
    Placement { piece: 1, x: 20.0, y: 20.0 },
    Placement { piece: 0, x: 1020.0, y: 20.0 },
    Placement { piece: 0, x: 1720.0, y: 20.0 },
    Placement { piece: 2, x: 20.0, y: 470.0 },
    Placement { piece: 2, x: 700.0, y: 470.0 },
    Placement { piece: 2, x: 1380.0, y: 470.0 },
    Placement { piece: 1, x: 20.0, y: 750.0 },
    Placement { piece: 0, x: 1020.0, y: 750.0 },
    Placement { piece: 2, x: 1740.0, y: 750.0 },
];

fn outer_mm(spec: &CassetteSpec) -> (f32, f32) {
    (spec.a + 2.0 * spec.r + 2.0 * spec.lip, spec.b + 2.0 * spec.r)
}

/// The 8-point hanger notch on the top return's outer edge, walked from
/// larger x to smaller x (the cut polygon, edge-breaking `cut.outer` only).
fn hanger_notch(c: f32, y_edge: f32) -> [(f32, f32); 8] {
    let (hw, hs) = (HANGER_W / 2.0, HANGER_SLOT);
    [
        (c + hs, y_edge),
        (c + hs, y_edge - HANGER_HOOK),
        (c + hw, y_edge - HANGER_HOOK),
        (c + hw, y_edge - HANGER_H),
        (c - hw, y_edge - HANGER_H),
        (c - hw, y_edge - HANGER_HOOK),
        (c - hs, y_edge - HANGER_HOOK),
        (c - hs, y_edge),
    ]
}

/// OCCS `cut.outer`: the union of the root face, the four returns and the
/// side mounting lips. Side returns run the full face height, top/bottom
/// returns only the face width — the evaluator's stepped contour, widened by
/// the lips (verified against `evaluateOccsCassetteTemplate`).
fn union_contour(a: f32, b: f32, r: f32, lip: f32, hangers: bool) -> Vec<(f32, f32)> {
    let mut pts = vec![(a, b + r)];
    if hangers {
        for &c in &[3.0 * a / 4.0, a / 4.0] {
            pts.extend_from_slice(&hanger_notch(c, b + r));
        }
    }
    pts.extend_from_slice(&[(0.0, b + r), (0.0, b), (-r, b)]);
    if lip > 0.0 {
        pts.extend_from_slice(&[(-r - lip, b), (-r - lip, 0.0), (-r, 0.0)]);
    } else {
        pts.push((-r, 0.0));
    }
    pts.extend_from_slice(&[(0.0, 0.0), (0.0, -r), (a, -r), (a, 0.0)]);
    if lip > 0.0 {
        pts.extend_from_slice(&[(a + r, 0.0), (a + r + lip, 0.0), (a + r + lip, b), (a + r, b)]);
    } else {
        pts.extend_from_slice(&[(a + r, 0.0), (a + r, b)]);
    }
    pts.push((a, b));
    pts
}

/// A face of the graph tree: its flat polygon (with hanger notches already
/// cut for the top return), its bolt holes, and its fold — the junction line
/// on the parent it rotates around, by a signed angle at full fold.
struct FacePoly {
    pts: Vec<(f32, f32)>,
    holes: Vec<((f32, f32), f32)>,
    parent: Option<usize>,
    /// A point on the junction line and its direction (flat frame).
    junction: (f32, f32),
    axis: (f32, f32),
    /// Signed degrees at full fold; returns rise to +z, lips fold back out.
    fold: f32,
    root: bool,
}

/// The cassette as a face/fold graph: root face, four return flanges, two
/// mounting lips. Children always follow their parents in the vec.
fn cassette_faces(spec: &CassetteSpec) -> Vec<FacePoly> {
    let rect = |x1: f32, y1: f32, x2: f32, y2: f32| vec![(x1, y1), (x2, y1), (x2, y2), (x1, y2)];
    let (a, b, r, lip) = (spec.a, spec.b, spec.r, spec.lip);

    // Top return with the hanger notches cut through its outer edge.
    let mut top = vec![(0.0, b), (a, b), (a, b + r)];
    if spec.hangers {
        for &c in &[3.0 * a / 4.0, a / 4.0] {
            top.extend_from_slice(&hanger_notch(c, b + r));
        }
    }
    top.push((0.0, b + r));

    let bolt_holes = |x: f32| {
        (0..spec.bolts)
            .map(|i| ((x, b * (i as f32 + 1.0) / (spec.bolts as f32 + 1.0)), BOLT_D / 2.0))
            .collect::<Vec<_>>()
    };
    let mut faces = vec![
        FacePoly { pts: rect(0.0, 0.0, a, b), holes: vec![], parent: None, junction: (0.0, 0.0), axis: (1.0, 0.0), fold: 0.0, root: true },
        FacePoly { pts: top, holes: vec![], parent: Some(0), junction: (0.0, b), axis: (1.0, 0.0), fold: 90.0, root: false },
        FacePoly { pts: rect(0.0, -r, a, 0.0), holes: vec![], parent: Some(0), junction: (0.0, 0.0), axis: (1.0, 0.0), fold: -90.0, root: false },
        FacePoly { pts: rect(-r, 0.0, 0.0, b), holes: bolt_holes(-r / 2.0), parent: Some(0), junction: (0.0, 0.0), axis: (0.0, 1.0), fold: 90.0, root: false },
        FacePoly { pts: rect(a, 0.0, a + r, b), holes: bolt_holes(a + r / 2.0), parent: Some(0), junction: (a, 0.0), axis: (0.0, 1.0), fold: -90.0, root: false },
    ];
    if lip > 0.0 {
        faces.push(FacePoly { pts: rect(-r - lip, 0.0, -r, b), holes: vec![], parent: Some(3), junction: (-r, 0.0), axis: (0.0, 1.0), fold: -90.0, root: false });
        faces.push(FacePoly { pts: rect(a + r, 0.0, a + r + lip, b), holes: vec![], parent: Some(4), junction: (a + r, 0.0), axis: (0.0, 1.0), fold: 90.0, root: false });
    }
    faces
}

// ---- 3d fold: composed rotations about junction lines (flat -> world) ----

type V3 = [f32; 3];

fn v_add(a: V3, b: V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
fn v_sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
fn v_scale(a: V3, k: f32) -> V3 { [a[0] * k, a[1] * k, a[2] * k] }
fn v_dot(a: V3, b: V3) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn v_cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
fn v_len(a: V3) -> f32 { v_dot(a, a).sqrt() }

/// Rodrigues rotation of `v` about the unit axis `k` by `ang` radians.
fn rot_about(v: V3, k: V3, ang: f32) -> V3 {
    let (c, s) = (ang.cos(), ang.sin());
    v_add(v_add(v_scale(v, c), v_scale(v_cross(k, v), s)), v_scale(k, v_dot(k, v) * (1.0 - c)))
}

/// Rotation about an arbitrary line (point + direction), as an affine map.
#[derive(Clone, Copy)]
struct FoldRot {
    m: [V3; 3],
    t: V3,
}

impl FoldRot {
    fn about_line(p: V3, dir: V3, ang: f32) -> Self {
        let k = v_scale(dir, 1.0 / v_len(dir).max(1e-9));
        let lin = |d: V3| rot_about(d, k, ang);
        let c0 = lin([1.0, 0.0, 0.0]);
        let c1 = lin([0.0, 1.0, 0.0]);
        let c2 = lin([0.0, 0.0, 1.0]);
        FoldRot {
            m: [[c0[0], c1[0], c2[0]], [c0[1], c1[1], c2[1]], [c0[2], c1[2], c2[2]]],
            t: v_sub(p, lin(p)),
        }
    }
    fn identity() -> Self {
        FoldRot { m: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], t: [0.0, 0.0, 0.0] }
    }
    fn apply(&self, p: V3) -> V3 {
        let m = &self.m;
        v_add(
            [
                m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2],
                m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2],
                m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2],
            ],
            self.t,
        )
    }
    /// Rotate a direction (no translation).
    fn dir(&self, d: V3) -> V3 {
        v_sub(self.apply(d), self.t)
    }
    /// `self ∘ other`: apply `other` first, then `self`.
    fn then(&self, other: &FoldRot) -> FoldRot {
        let c0 = self.dir([other.m[0][0], other.m[1][0], other.m[2][0]]);
        let c1 = self.dir([other.m[0][1], other.m[1][1], other.m[2][1]]);
        let c2 = self.dir([other.m[0][2], other.m[1][2], other.m[2][2]]);
        FoldRot {
            m: [[c0[0], c1[0], c2[0]], [c0[1], c1[1], c2[1]], [c0[2], c1[2], c2[2]]],
            t: self.apply(other.t),
        }
    }
}

/// Per-face world transforms at fold progress `t` (angle = fold·t·π/2).
fn fold_transforms(faces: &[FacePoly], t: f32) -> Vec<FoldRot> {
    let mut out = vec![FoldRot::identity(); faces.len()];
    for i in 0..faces.len() {
        let f = &faces[i];
        let rot = FoldRot::about_line(
            [f.junction.0, f.junction.1, 0.0],
            [f.axis.0, f.axis.1, 0.0],
            f.fold.to_radians() * t,
        );
        out[i] = match f.parent {
            Some(p) => out[p].then(&rot),
            None => rot,
        };
    }
    out
}

pub struct FacadeVideoVideo<'a> {
    pub media: &'a FacadeVideoMedia,
    title: TitleScene<'a>,
    author: AuthorScene,
    bake: BakeScene,
    nest: NestScene,
    cut: CutScene,
}

impl<'a> FacadeVideoVideo<'a> {
    pub fn new(media: &'a FacadeVideoMedia, title: &'a str) -> Self {
        Self {
            media,
            title: TitleScene { title },
            author: AuthorScene,
            bake: BakeScene,
            nest: NestScene,
            cut: CutScene,
        }
    }
}

impl std::fmt::Debug for FacadeVideoVideo<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FacadeVideoVideo").finish()
    }
}

impl Video for FacadeVideoVideo<'_> {
    const FPS: usize = FPS;
    const WIDTH: usize = WIDTH;
    const HEIGHT: usize = HEIGHT;
    const BACKGROUND_COLOR: Color = Color::BLACK;

    fn duration(&self) -> Duration<'_> {
        Duration::Auto
    }

    fn audio(&self) -> AudioMap<'_> {
        AudioMap::none()
    }

    fn define_scenes(&self) -> Scenes<'_> {
        Scenes::from(vec![
            &self.title as &dyn Scene,
            &self.author,
            &self.bake,
            &self.nest,
            &self.cut,
        ])
    }

    fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let grid: Vec<Svgr> = (0..=20)
            .flat_map(|i| {
                let x = i as f32 * 96.0;
                let y = i as f32 * 96.0;
                let mut lines = vec![fframes::svgr!(<path d={format!("M{x} 0 V1080")} stroke={GRID} stroke-width="1" />)];
                if i <= 11 {
                    lines.push(fframes::svgr!(<path d={format!("M0 {y} H1920")} stroke={GRID} stroke-width="1" />));
                }
                lines
            })
            .collect();
        fframes::svgr!(
            <svg xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={HEIGHT} viewBox="0 0 1920 1080">
                <rect width="1920" height="1080" fill={BG} />
                {grid}
                {ctx.render_scenes(&frame)}
            </svg>
        )
    }
}

// ---- shared helpers ----

/// The Perigram mark (public/icon.svg, per the Rive mark spec): a folded
/// axonometric cassette — top rhombus the face, lower parallelograms the
/// flanges, V gap the rib — on the brand gradient. `phase` spins the face
/// square in its own plane (rotating core, 90°-periodic; 0 = rest).
fn logo<'a>(x: f32, y: f32, size: f32, id: &'a str, phase: f32) -> Svgr<'a> {
    let s = size / 128.0;
    let grad_id = format!("grad-{id}");
    let (cx, cy) = (64.0, 50.9);
    let a = 19.4_f32;
    let (sin_p, cos_p) = phase.sin_cos();
    let mut d = String::from("M");
    for (i, &(ux, uy)) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)].iter().enumerate() {
        let (c0, c1) = (ux * a, uy * a);
        let (rx, ry) = (c0 * cos_p - c1 * sin_p, c0 * sin_p + c1 * cos_p);
        let (px, py) = (cx + 0.866 * (rx - ry), cy + 0.5 * (rx + ry));
        if i > 0 {
            d.push('L');
        }
        d.push_str(&format!("{px:.2} {py:.2} "));
    }
    d.push('Z');
    fframes::svgr!(
        <g transform={format!("translate({x} {y}) scale({s})")}>
            <defs>
                <linearGradient id={grad_id.clone()} gradientUnits="userSpaceOnUse" x1="13" y1="31" x2="114" y2="99">
                    <stop offset="0" stop-color="#ff0000" />
                    <stop offset="1" stop-color="#ff6600" />
                </linearGradient>
            </defs>
            <path fill={format!("url(#{grad_id})")} d={d.clone()} />
            <path fill={format!("url(#{grad_id})")} d="M30.4 70.3 L64.0 89.7 L47.2 99.4 L13.5 79.5 Z" />
            <path fill={format!("url(#{grad_id})")} d="M97.6 70.3 L64.0 89.7 L80.8 99.4 L114.4 79.5 Z" />
        </g>
    )
}

fn ramp(frame: &Frame, start: f32) -> f32 {
    frame.animate_runtime(AnimateRuntimeInput { on_second: start, from: 0.0, to: 1.0, animation_runtime: &RT_EASE_OUT })
}

fn ramp_fast(frame: &Frame, start: f32) -> f32 {
    frame.animate_runtime(AnimateRuntimeInput { on_second: start, from: 0.0, to: 1.0, animation_runtime: &RT_FAST })
}

fn rise(frame: &Frame, start: f32, px: f32) -> f32 {
    frame.animate_runtime(AnimateRuntimeInput { on_second: start, from: px, to: 0.0, animation_runtime: &RT_SPRING })
}

/// Whole-scene cross-fade: the incoming scene fades in over exactly the
/// overlap frames, reaching full opacity precisely when the previous scene's
/// range ends — the handoff never changes the composite by a frame.
fn scene_in(t: f32) -> f32 {
    (t * FPS as f32 / CROSS_F as f32).clamp(0.0, 1.0)
}

/// One continuous camera push over the whole video (1.0 -> 1.035 on global
/// time). Every scene computes the same transform for the same global frame,
/// so during an overlap the incoming and outgoing content sits pixel-on-pixel
/// and the handoff never jumps the framing.
fn camera(frame: &Frame) -> String {
    let gt = frame.global_index as f32 / frame.fps as f32;
    let k = 1.0 + 0.035 * (gt / TOTAL_S);
    format!("translate(960 540) scale({k:.4}) translate(-960 -540)")
}

/// Ambient loop 0 -> 1 -> 0 over `period` seconds from video start.
fn breathe(t: f32, period: f32) -> f32 {
    0.5 - 0.5 * (2.0 * std::f32::consts::PI * t / period).cos()
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn lerp_pt(a: (f32, f32), b: (f32, f32), t: f32) -> (f32, f32) {
    (lerp(a.0, b.0, t), lerp(a.1, b.1, t))
}

/// Linear interpolation between two `#rrggbb` colors.
fn lerp_hex(a: &str, b: &str, t: f32) -> String {
    let p = |s: &str| (
        u8::from_str_radix(&s[1..3], 16).unwrap() as f32,
        u8::from_str_radix(&s[3..5], 16).unwrap() as f32,
        u8::from_str_radix(&s[5..7], 16).unwrap() as f32,
    );
    let (a1, a2, a3) = p(a);
    let (b1, b2, b3) = p(b);
    format!(
        "#{:02x}{:02x}{:02x}",
        (a1 + (b1 - a1) * t) as u8,
        (a2 + (b2 - a2) * t) as u8,
        (a3 + (b3 - a3) * t) as u8
    )
}

fn fit_size<'a>(frame: &mut Frame, ctx: &FFramesContext<'a, '_>, text: &'a str, preferred: usize, max_width: usize) -> usize {
    let mut size = preferred;
    loop {
        let font = FontQuery { family: SANS, size, weight: W_BOLD, ..Default::default() };
        match frame.text_width(ctx, font, text) {
            Some(width) if width > max_width && size > 28 => size -= 4,
            _ => return size,
        }
    }
}

fn poly_path(pts: &[(f32, f32)]) -> String {
    let mut d = String::new();
    for (i, (x, y)) in pts.iter().enumerate() {
        if i == 0 {
            d.push_str(&format!("M{x:.2} {y:.2}"));
        } else {
            d.push_str(&format!(" L{x:.2} {y:.2}"));
        }
    }
    d.push_str(" Z");
    d
}

/// Walk a closed polyline by fraction of total length; returns the point.
fn polyline_walk(pts: &[(f32, f32)], p: f32) -> (f32, f32) {
    let n = pts.len();
    if n < 2 {
        return (0.0, 0.0);
    }
    let mut segs = Vec::with_capacity(n);
    let mut total = 0.0;
    for i in 0..n {
        let (a, b) = (pts[i], pts[(i + 1) % n]);
        let len = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
        segs.push((a, b, len));
        total += len;
    }
    let mut s = p.clamp(0.0, 1.0) * total;
    for (a, b, len) in segs {
        if s <= len {
            let t = if len > 0.0 { s / len } else { 0.0 };
            return (a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t);
        }
        s -= len;
    }
    pts[0]
}

fn contour_length(pts: &[(f32, f32)]) -> f32 {
    let n = pts.len();
    (0..n)
        .map(|i| {
            let (a, b) = (pts[i], pts[(i + 1) % n]);
            ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt()
        })
        .sum()
}

/// The union contour centered on the face center (the outer bbox center)
/// and scaled to px.
fn centered_contour(a: f32, b: f32, r: f32, lip: f32, hangers: bool, s: f32) -> Vec<(f32, f32)> {
    let (sx, sy) = (a / 2.0 * s, b / 2.0 * s);
    union_contour(a, b, r, lip, hangers).into_iter().map(|(x, y)| (x * s - sx, y * s - sy)).collect()
}

/// Dimension line pair in the dimension.cassette style (violet, dotted).
fn dim_h<'a>(x1: f32, x2: f32, y: f32, label: &str, size: f32) -> Svgr<'a> {
    fframes::svgr!(
        <g stroke={DIMC} stroke-width="1.5" stroke-dasharray="1 4">
            <path d={format!("M{x1} {y} H{x2}")} />
            <path d={format!("M{x1} {} V{}", y - 7.0, y + 7.0)} />
            <path d={format!("M{x2} {} V{}", y - 7.0, y + 7.0)} />
            <text x={(x1 + x2) / 2.0} y={y - 12.0} text-anchor="middle" font-family={MONO} font-size={size} font-weight={W_REG} fill={DIMC} stroke="none">{label.to_string()}</text>
        </g>
    )
}

fn dim_v<'a>(y1: f32, y2: f32, x: f32, label: &str, size: f32) -> Svgr<'a> {
    fframes::svgr!(
        <g stroke={DIMC} stroke-width="1.5" stroke-dasharray="1 4">
            <path d={format!("M{x} {y1} V{y2}")} />
            <path d={format!("M{} {y1} H{}", x - 7.0, x + 7.0)} />
            <path d={format!("M{} {y2} H{}", x - 7.0, x + 7.0)} />
            <text x={x + 14.0} y={(y1 + y2) / 2.0 + 8.0} font-family={MONO} font-size={size} font-weight={W_REG} fill={DIMC} stroke="none">{label.to_string()}</text>
        </g>
    )
}

// ---- flat pattern drawing ----

#[derive(Clone, Copy, PartialEq)]
enum Detail {
    /// Template drawing: contour, fold routes, bolts, mark.
    Full,
    /// Production piece: contour, fold routes, bolts.
    Std,
    /// Small placed piece: contour, fold routes.
    Tiny,
}

struct FlatOpts {
    scale: f32,
    cut_w: f32,
    detail: Detail,
    /// Production mark: (name, template id, workpiece line).
    mark: Option<(&'static str, &'static str, &'static str)>,
    body_fill: &'static str,
}

/// Cassette flat pattern centered on (0, 0): the union contour with the
/// hanger notches cut through the top return's outer edge, fold-route dashes
/// on every junction (returns and lips), bolt holes through the side returns
/// and the three-line production mark on the root face.
fn flat_piece<'a>(spec: &CassetteSpec, o: &FlatOpts) -> Svgr<'a> {
    let s = o.scale;
    let (a, b, r, lip) = (spec.a, spec.b, spec.r, spec.lip);
    let ctr = centered_contour(a, b, r, lip, spec.hangers, s);

    let mut extras: Vec<Svgr> = vec![];

    // Fold routes: the return junctions and, when present, the lip junctions.
    let dash = (r * s * 0.3).max(4.0);
    let dash_s = format!("{dash} {}", dash * 0.66);
    let (aw, ah) = (a * s, b * s);
    let mut fold_lines = String::new();
    for &y in &[-ah / 2.0, ah / 2.0] {
        fold_lines.push_str(&format!("M{:.2} {y:.2} H{:.2} ", -aw / 2.0, aw / 2.0));
    }
    for &x in &[-aw / 2.0, aw / 2.0] {
        fold_lines.push_str(&format!("M{x:.2} {:.2} V{:.2} ", -ah / 2.0, ah / 2.0));
    }
    if lip > 0.0 {
        let lx = aw / 2.0 + r * s;
        for &x in &[-lx, lx] {
            fold_lines.push_str(&format!("M{x:.2} {:.2} V{:.2} ", -ah / 2.0, ah / 2.0));
        }
    }
    extras.push(fframes::svgr!(
        <path d={fold_lines} stroke={FOLD} stroke-width={o.cut_w * 0.8} stroke-dasharray={dash_s.clone()} fill="none" />
    ));

    // Bolt holes through the side returns (cut.hole circles).
    if o.detail != Detail::Tiny && r * s > 8.0 {
        for &hx in &[-(aw / 2.0 + r * s / 2.0), aw / 2.0 + r * s / 2.0] {
            for i in 0..spec.bolts {
                let hy = -ah / 2.0 + ah * (i as f32 + 1.0) / (spec.bolts as f32 + 1.0);
                extras.push(fframes::svgr!(
                    <circle cx={hx} cy={hy} r={(BOLT_D / 2.0) * s} fill={BG} stroke={CUT} stroke-width={o.cut_w * 0.8} />
                ));
            }
        }
    }

    // Production mark on the root face: name / template id / workpiece.
    if let Some((name, tpl, wp)) = o.mark {
        if o.detail == Detail::Full && aw > 150.0 {
            let big = 22.0_f32.min(ah * 0.10);
            extras.push(fframes::svgr!(
                <text x={-aw / 2.0 + 8.0} y={ah / 2.0 - big * 3.4} font-family={MONO} font-size={big} font-weight={W_BOLD} fill={MARK}>{name}</text>
                <text x={-aw / 2.0 + 8.0} y={ah / 2.0 - big * 2.25} font-family={MONO} font-size={big * 0.78} font-weight={W_REG} fill={MARK}>{tpl}</text>
                <text x={-aw / 2.0 + 8.0} y={ah / 2.0 - big * 1.2} font-family={MONO} font-size={big * 0.78} font-weight={W_REG} fill={MARK}>{wp}</text>
            ));
        }
    }

    fframes::svgr!(
        <g>
            <path d={poly_path(&ctr)} fill={o.body_fill} stroke={CUT} stroke-width={o.cut_w} />
            <rect x={-aw / 2.0} y={-ah / 2.0} width={aw} height={ah} fill={FACE_BLUE} opacity="0.06" />
            {extras}
        </g>
    )
}

// ---- folded drawing (the same faces, folded about their junctions) ----

/// Isometric projection of world mm to px; `raw` is uncentered.
fn iso_raw(p: V3, s: f32) -> (f32, f32) {
    ((p[0] - p[1]) * 0.866 * s, ((p[0] + p[1]) * 0.5 - p[2]) * s)
}

/// Folded cassette centered on the projected shape's bounding center.
/// `t_fold` 0 is the exact flat pattern, 1 the folded cassette with returns
/// up and lips out; holes and hanger notches ride their faces. `flatten` 1
/// projects the fold-0 shape with the flat pattern's own axis-aligned
/// projection instead of the iso one, so a folded piece can settle onto the
/// flat drawing (and rise off it) with no silhouette or size change. Faces
/// are drawn far-to-near along the iso depth axis (x + y).
fn folded_piece<'a>(spec: &CassetteSpec, s: f32, t_fold: f32, flatten: f32, accent: bool) -> Svgr<'a> {
    let faces = cassette_faces(spec);
    let transforms = fold_transforms(&faces, t_fold);

    // Project everything, then recenter on the bounding box.
    let project_raw = |p: V3| -> (f32, f32) {
        let (ix, iy) = iso_raw(p, s);
        (lerp(ix, p[0] * s, flatten), lerp(iy, p[1] * s, flatten))
    };
    let mut minx = f32::MAX;
    let mut miny = f32::MAX;
    let mut maxx = f32::MIN;
    let mut maxy = f32::MIN;
    let mut probe = |p: V3| {
        let (px, py) = project_raw(p);
        minx = minx.min(px);
        maxx = maxx.max(px);
        miny = miny.min(py);
        maxy = maxy.max(py);
    };
    for (f, t) in faces.iter().zip(&transforms) {
        for &p in &f.pts {
            probe(t.apply([p.0, p.1, 0.0]));
        }
        for &(c, rad) in &f.holes {
            probe(t.apply([c.0 + rad, c.1, 0.0]));
            probe(t.apply([c.0 - rad, c.1, 0.0]));
        }
    }
    let (offx, offy) = (-(minx + maxx) / 2.0, -(miny + maxy) / 2.0);

    let light = v_scale([0.45, 0.35, 0.82], 1.0 / v_len([0.45, 0.35, 0.82]));
    let project = |p: V3| -> (f32, f32) {
        let (px, py) = project_raw(p);
        (px + offx, py + offy)
    };

    let depth = |i: usize| -> f32 {
        let f = &faces[i];
        let t = &transforms[i];
        let mut sum = 0.0;
        for &p in &f.pts {
            let w = t.apply([p.0, p.1, 0.0]);
            sum += w[0] + w[1];
        }
        sum / f.pts.len() as f32
    };
    let mut order: Vec<usize> = (0..faces.len()).collect();
    order.sort_by(|&x, &y| depth(x).partial_cmp(&depth(y)).unwrap());

    let mut parts: Vec<Svgr> = vec![];
    for &i in &order {
        let f = &faces[i];
        let t = &transforms[i];
        let pts: Vec<(f32, f32)> = f.pts.iter().map(|&p| project(t.apply([p.0, p.1, 0.0]))).collect();
        let normal = t.dir([0.0, 0.0, 1.0]);
        let lam = v_dot(normal, light).max(0.0);
        let k = 0.35 + 0.65 * lam;
        let fill = if f.root && accent {
            lerp_hex("#4a1524", "#a32c4e", k)
        } else if f.root {
            lerp_hex("#232327", "#48484f", k)
        } else {
            lerp_hex("#1c1c20", "#3d3d44", k)
        };
        let mut face_parts: Vec<Svgr> = vec![fframes::svgr!(
            <path d={poly_path(&pts)} fill={fill} stroke={BORDER} stroke-width="1" />
        )];
        for &(c, rad) in &f.holes {
            let mut circ: Vec<(f32, f32)> = vec![];
            for k2 in 0..20 {
                let ang = std::f32::consts::TAU * k2 as f32 / 20.0;
                circ.push(project(t.apply([c.0 + rad * ang.cos(), c.1 + rad * ang.sin(), 0.0])));
            }
            face_parts.push(fframes::svgr!(
                <path d={poly_path(&circ)} fill={BG} stroke={BORDER} stroke-width="0.8" />
            ));
        }
        parts.push(fframes::svgr!(<g>{face_parts}</g>));
    }

    fframes::svgr!(<g>{parts}</g>)
}

/// Scale putting a folded spec's iso footprint near `target_w` px wide.
fn fit_folded_scale(spec: &CassetteSpec, target_w: f32) -> f32 {
    target_w / ((spec.a + spec.b) * 0.866)
}

// ---- shared nest frame (Bake handoff, Nest, Cut zoom) ----

/// Sheet scale (px per mm) and origin shared by the bake→nest handoff, the
/// nest scene and the cut scene's zoom.
const NEST_S: f32 = 0.42;

/// The nest placements the bake scene's three variants fly to — the bake→nest
/// handoff: these pieces are already on the sheet when NestScene opens.
const HANDOFF: [usize; 3] = [1, 0, 3];

fn sheet_frame() -> (f32, f32) {
    (240.0, 317.0)
}

/// Screen center of a placed piece in the nest frame.
fn placement_center(i: usize) -> (f32, f32) {
    let pl = &LAYOUT[i];
    let spec = &SPECS[pl.piece];
    let (ow, oh) = outer_mm(spec);
    let (sx, sy) = sheet_frame();
    (sx + (pl.x + oh / 2.0) * NEST_S, sy + (pl.y + ow / 2.0) * NEST_S)
}

fn sheet_svg<'a>(o: f32) -> Svgr<'a> {
    let (sx, sy) = sheet_frame();
    fframes::svgr!(
        <g opacity={o}>
            <rect x={sx} y={sy} width={SHEET_MM.0 * NEST_S} height={SHEET_MM.1 * NEST_S} fill={BG} stroke={SHEET_LINE} stroke-width="2" stroke-dasharray="10 6" />
        </g>
    )
}

/// Detail level of a piece on the sheet: bolt holes only when the piece is
/// large enough at nest scale.
fn nest_detail(spec: &CassetteSpec) -> Detail {
    if outer_mm(spec).0 * NEST_S > 260.0 { Detail::Std } else { Detail::Tiny }
}

/// A placed flat piece with its mark, in its final sheet orientation
/// (rotated 90°): the single drawing every sheet view — the bake landing,
/// the nest placements — hands to the next one.
fn placed_flat<'a>(spec: &CassetteSpec, cut_w: f32, mark_o: f32) -> Svgr<'a> {
    let (ow, oh) = outer_mm(spec);
    let detail = nest_detail(spec);
    fframes::svgr!(
        <g transform="rotate(90)">
            {flat_piece(spec, &FlatOpts { scale: NEST_S, cut_w, detail, mark: None, body_fill: SURFACE })}
        </g>
        <text x={-oh * NEST_S / 2.0 + 6.0} y={ow * NEST_S / 2.0 - 7.0} font-family={MONO} font-size="17" font-weight={W_REG} fill={MARK} opacity={mark_o}>{spec.id}</text>
    )
}

/// Placed flat piece `i` of the nest layout at its final position/rotation,
/// with its production mark.
fn placed_piece<'a>(i: usize, cut_w: f32, mark_o: f32) -> Svgr<'a> {
    let (cx, cy) = placement_center(i);
    fframes::svgr!(
        <g transform={format!("translate({cx:.1} {cy:.1})")}>
            {placed_flat(&SPECS[LAYOUT[i].piece], cut_w, mark_o)}
        </g>
    )
}

// ---- scene 0: title ----

#[derive(Debug)]
struct TitleScene<'a> {
    title: &'a str,
}

impl Scene for TitleScene<'_> {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(DUR_S[0])
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        // Fade in from black, and out again over the cross-fade window: the
        // wordmark is the one scene whose content does not continue in the
        // next scene, so it must be gone by the handoff.
        let o = scene_in(t) * (1.0 - ramp_fast(&frame, DUR_S[0] - CROSS));

        // Word-by-word wordmark with the rotating-core mark above.
        let spin = 2.0 * std::f32::consts::PI * t / (1.6 * 4.0);
        let words: Vec<(&str, bool)> = match self.title.find("Facade") {
            Some(idx) => vec![(&self.title[..idx], false), (&self.title[idx..], true)],
            None => vec![(self.title, false)],
        };
        let size = fit_size(&mut frame, ctx, self.title, 120, 740);
        let mut word_texts: Vec<Svgr> = vec![];
        let mut wx = 154.0f32;
        for (wi, &(word, accent)) in words.iter().enumerate() {
            let wpx = frame
                .text_width(ctx, FontQuery { family: SANS, size, weight: W_BOLD, ..Default::default() }, word)
                .map(|w| w as f32)
                .unwrap_or(size as f32 * word.len() as f32 * 0.55);
            let t0 = 0.1 + wi as f32 * 0.14;
            word_texts.push(fframes::svgr!(
                <g transform={Transform::translate(0.0, rise(&frame, t0, 64.0))} opacity={ramp(&frame, t0)}>
                    <text x={wx} y="560" font-family={SANS} font-size={size} font-weight={W_BOLD} fill={if accent { ACCENT } else { INK }} letter-spacing="-3">{word}</text>
                </g>
            ));
            wx += wpx - size as f32 * 0.02;
        }

        let sub = frame
            .text_fit(
                ctx,
                FontQuery { family: MONO, size: 28, weight: W_REG, ..Default::default() },
                "PARAMETRIC CASSETTES — DESIGN TO PRODUCTION",
                760,
                TextOverflow::Ellipsis,
            )
            .map(|s| s.into_owned())
            .unwrap_or_else(|| "PARAMETRIC CASSETTES".to_owned());
        let line = (760.0 * ramp(&frame, 0.5)).max(0.5);

        fframes::svgr!(
            <g opacity={o} transform={camera(&frame)}>
                <g transform={Transform::translate(0.0, rise(&frame, 0.0, 24.0))} opacity={ramp(&frame, 0.05)}>
                    {logo(154.0, 330.0, 120.0, "title", spin)}
                </g>
                {word_texts}
                <path d="M154 616 H1620" stroke={SURFACE_2} stroke-width="2" />
                <rect x="154" y="615" width={line} height="3" fill={ACCENT} />
                <text x="154" y="684" font-family={MONO} font-size="28" font-weight={W_REG} fill={MUTED} letter-spacing="1" opacity={ramp(&frame, 0.7)}>{sub}</text>
            </g>
        )
    }
}

// ---- scene 1: author the template, then fold it ----

#[derive(Debug)]
struct AuthorScene;

/// Where the author scene's drawing lives, and where the folded hero hands
/// off to the bake scene.
const AUTHOR_CENTER: (f32, f32) = (660.0, 545.0);
const AUTHOR_FLAT_S: f32 = 0.62;
const AUTHOR_FOLDED_W: f32 = 440.0;

impl Scene for AuthorScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(DUR_S[1])
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(CROSS)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);
        let spec = &SPECS[0];
        let (r, lip) = (spec.r, spec.lip);

        // Parameters settle once; dimensions show only while changing.
        let a = frame.animate(&fframes::timeline!(
            at 2.2 => 3.1, animate 180.0_f32 => 300.0, EASE_IN_OUT,
        ));
        let b = frame.animate(&fframes::timeline!(
            at 3.3 => 4.2, animate 360.0_f32 => 600.0, EASE_IN_OUT,
        ));

        // The drawing traces in, then the same geometry folds up in place.
        let (cx, cy) = AUTHOR_CENTER;
        let s = AUTHOR_FLAT_S;
        let trace = frame.animate(&fframes::timeline!(
            at 0.25 => 1.45, animate 0.0_f32 => 1.0, EASE_IN_OUT,
        ));
        let ctr = centered_contour(a, b, r, lip, true, s);
        let per = contour_length(&ctr);
        let features = ramp(&frame, 1.5);
        let (ow, oh) = ((a + 2.0 * r + 2.0 * lip) * s, (b + 2.0 * r) * s);

        let fold: f32 = frame.animate_runtime(AnimateRuntimeInput { on_second: 4.6, from: 0.0, to: 1.0, animation_runtime: &RT_FOLD });
        let flat_o = 1.0 - ramp(&frame, 4.75);
        let fold_o = ramp(&frame, 4.6);
        // The folded drawing starts as the exact flat pattern (flatten 1 at
        // fold 0) and grows to the bake handoff width as the walls rise, so
        // the flat -> folded cross-fade never changes the silhouette.
        let s_fold = lerp(s, fit_folded_scale(spec, AUTHOR_FOLDED_W), ramp(&frame, 4.6));
        let flatten = (1.0 - fold).clamp(0.0, 1.0);
        let live = spec.clone_lived(a, b);

        let dim_a = ramp(&frame, 2.1) * (1.0 - ramp(&frame, 3.6));
        let dim_b = ramp(&frame, 3.2) * (1.0 - ramp(&frame, 4.7));

        let flat = fframes::svgr!(
            <g opacity={flat_o} transform={format!("translate({cx} {cy})")}>
                <path d={poly_path(&ctr)} fill="none" stroke={CUT} stroke-width="3" stroke-dasharray={per} stroke-dashoffset={per * (1.0 - trace)} />
                <g opacity={features}>
                    {flat_piece(&live, &FlatOpts { scale: s, cut_w: 3.0, detail: Detail::Full, mark: Some(("FCT-01", "tpl_8842", "WP 1")), body_fill: SURFACE })}
                </g>
                <g opacity={dim_a}>
                    {dim_h(-ow / 2.0, ow / 2.0, oh / 2.0 + 34.0, &format!("A {a:.0}"), 26.0)}
                </g>
                <g opacity={dim_b}>
                    {dim_v(-oh / 2.0, oh / 2.0, ow / 2.0 + 34.0, &format!("B {b:.0}"), 26.0)}
                </g>
            </g>
        );

        let folded = fframes::svgr!(
            <g opacity={fold_o} transform={format!("translate({cx} {cy})")}>
                {folded_piece(&live, s_fold, fold.clamp(0.0, 1.15), flatten, false)}
            </g>
        );

        fframes::svgr!(
            <g opacity={o} transform={camera(&frame)}>
                {flat}
                {folded}
            </g>
        )
    }
}

impl CassetteSpec {
    /// The same spec with live parameter values (the author scene morphs
    /// A and B before baking).
    fn clone_lived(&self, a: f32, b: f32) -> CassetteSpec {
        CassetteSpec { id: self.id, a, b, r: self.r, lip: self.lip, hangers: self.hangers, bolts: self.bolts }
    }
}

// ---- scene 2: bake variants, unfold onto the sheet ----

#[derive(Debug)]
struct BakeScene;

/// Fan positions of the three folded variants; each one flies to its
/// `HANDOFF` nest placement (flat, rot 90).
const BAKE_FAN: [(f32, f32); 3] = [(472.0, 520.0), (952.0, 520.0), (1432.0, 520.0)];

impl Scene for BakeScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(DUR_S[2])
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(CROSS)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);

        let sheet_o = ramp(&frame, 2.6);
        let mut parts: Vec<Svgr> = vec![];

        for i in 0..3usize {
            let spec = &SPECS[i];
            // Split out of the author's folded hero: piece 0 IS the hero, the
            // other two materialize at its position just before they spring
            // out (never during the author cross-fade window).
            let split = frame.animate_runtime(AnimateRuntimeInput { on_second: 0.6 + i as f32 * 0.12, from: 0.0, to: 1.0, animation_runtime: &RT_SPRING });
            let birth = if i == 0 { 1.0 } else { ramp_fast(&frame, 0.4 + (i as f32 - 1.0) * 0.12) };
            let fan_scale = fit_folded_scale(spec, AUTHOR_FOLDED_W);
            let start = lerp_pt(AUTHOR_CENTER, BAKE_FAN[i], split);
            let label_o = ramp(&frame, 1.5 + i as f32 * 0.12);

            // Unfold, flatten onto the sheet's axis and fly to the nest
            // placement; the flight's last stretch cross-fades to the placed
            // flat drawing with the silhouette already matching.
            let t0 = 2.6 + i as f32 * 0.18;
            let p = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 0.0, to: 1.0, animation_runtime: &RT_EASE_IN_OUT });
            let (dx, dy) = placement_center(HANDOFF[i]);
            let pos = lerp_pt(start, (dx, dy), p);
            let fold_t = 1.0 - (p / 0.6).clamp(0.0, 1.0);
            let flatten = ((p - 0.6) / 0.4).clamp(0.0, 1.0);
            let rot = 90.0 * p;
            let fscale = lerp(fan_scale, NEST_S, p);
            let sw = ((p - 0.9) / 0.1).clamp(0.0, 1.0);

            parts.push(fframes::svgr!(
                <g opacity={birth} transform={format!("translate({:.1} {:.1})", pos.0, pos.1)}>
                    <g transform={format!("rotate({rot:.2})")} opacity={1.0 - sw}>
                        {folded_piece(spec, fscale, fold_t, flatten, false)}
                    </g>
                    <g opacity={sw}>
                        {placed_flat(spec, 1.8, 1.0)}
                    </g>
                </g>
                <g opacity={label_o * (1.0 - ramp(&frame, t0))}>
                    <text x={BAKE_FAN[i].0} y={BAKE_FAN[i].1 + 176.0} text-anchor="middle" font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED}>{format!("{} · {:.0}×{:.0}", spec.id, spec.a, spec.b)}</text>
                </g>
            ));
        }

        fframes::svgr!(
            <g opacity={o} transform={camera(&frame)}>
                {sheet_svg(sheet_o)}
                {parts}
            </g>
        )
    }
}

// ---- scene 3: nest the sheet ----

#[derive(Debug)]
struct NestScene;

impl Scene for NestScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(DUR_S[3])
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(CROSS)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);

        // Piece marks fade out before the cut handoff: the cut scene's zoom
        // would sweep them off the canvas, so the sheet is handed over clean.
        let mark_out = 1.0 - ramp_fast(&frame, 4.7);

        let fly: Vec<usize> = (0..NESTED).filter(|i| !HANDOFF.contains(i)).collect();
        let mut pieces: Vec<Svgr> = vec![];
        for i in 0..NESTED {
            if HANDOFF.contains(&i) {
                pieces.push(placed_piece(i, 1.8, mark_out));
                continue;
            }
            let k = fly.iter().position(|&x| x == i).unwrap();
            let (dx, dy) = placement_center(i);
            let t0 = 0.55 + k as f32 * 0.3;
            let cx = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 2150.0, to: dx, animation_runtime: &RT_EASE_IN_OUT });
            let cy = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: dy - 40.0, to: dy, animation_runtime: &RT_EASE_IN_OUT });
            let rot = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 104.0, to: 90.0, animation_runtime: &RT_SPRING });
            let po = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 0.0, to: 1.0, animation_runtime: &RT_FAST });
            let ring_p = ramp(&frame, t0 + 0.5);
            let ring_r = 10.0 + 26.0 * ring_p;
            let spec = &SPECS[LAYOUT[i].piece];
            let mark_o = ramp(&frame, t0 + 0.55) * mark_out;
            let (ow, oh) = outer_mm(spec);
            pieces.push(fframes::svgr!(
                <g opacity={po} transform={format!("translate({cx:.1} {cy:.1})")}>
                    <circle r={ring_r} fill="none" stroke={ACCENT} stroke-width="2" opacity={0.5 * (1.0 - ring_p)} />
                    <g transform={format!("rotate({rot:.2})")}>
                        {flat_piece(spec, &FlatOpts { scale: NEST_S, cut_w: 1.8, detail: nest_detail(spec), mark: None, body_fill: SURFACE })}
                    </g>
                    <text x={-oh * NEST_S / 2.0 + 6.0} y={ow * NEST_S / 2.0 - 7.0} font-family={MONO} font-size="17" font-weight={W_REG} fill={MARK} opacity={mark_o}>{spec.id}</text>
                </g>
            ));
        }

        // One number, briefly: the solver's efficiency, then gone — fully
        // faded before the cut handoff.
        let eff = EFFICIENCY * frame.animate(&fframes::timeline!(
            at 3.4 => 4.4, animate 0.0_f32 => 1.0, EASE_OUT_EXPO,
        ));
        let eff_o = ramp(&frame, 3.3) * (1.0 - ramp_fast(&frame, 4.55));
        let stats = fframes::svgr!(
            <g opacity={eff_o}>
                <text x="1470" y="500" font-family={MONO} font-size="22" font-weight={W_REG} fill={MUTED} letter-spacing="3">"NEST EFFICIENCY"</text>
                <text x="1470" y="576" font-family={MONO} font-size="64" font-weight={W_BOLD} fill={INK}>{format!("{eff:.1}%")}</text>
            </g>
        );

        fframes::svgr!(
            <g opacity={o} transform={camera(&frame)}>
                {sheet_svg(1.0)}
                {pieces}
                {stats}
            </g>
        )
    }
}

// ---- scene 4: cut, fold, facade wall ----

#[derive(Debug)]
struct CutScene;

/// The hero of the cut: the PFC-001 at nest placement 1.
const HERO: usize = 1;

/// Wall cell grid: 4×3 folded cassettes from this run, iso-arranged.
const WALL_ORIGIN: (f32, f32) = (1272.0, 380.0);
const WALL_STEP: (f32, f32) = (150.0, 128.0);
const WALL_CELL_SCALE: f32 = 0.155;

fn wall_cell_center(col: usize, row: usize) -> (f32, f32) {
    (WALL_ORIGIN.0 + col as f32 * WALL_STEP.0, WALL_ORIGIN.1 + row as f32 * WALL_STEP.1)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Evaluator ground truth (`node video/groundtruth.mjs` from the repo
    /// root): the four-return cassette and the one with side mounting lips.
    #[test]
    fn contour_matches_evaluator_ground_truth() {
        let simple: Vec<(f32, f32)> = [
            (300.0, 640.0), (0.0, 640.0), (0.0, 600.0), (-40.0, 600.0), (-40.0, 0.0),
            (0.0, 0.0), (0.0, -40.0), (300.0, -40.0), (300.0, 0.0), (340.0, 0.0),
            (340.0, 600.0), (300.0, 600.0),
        ].into();
        assert_eq!(union_contour(300.0, 600.0, 40.0, 0.0, false), simple);

        let complex: Vec<(f32, f32)> = [
            (300.0, 640.0), (0.0, 640.0), (0.0, 600.0), (-40.0, 600.0), (-65.0, 600.0),
            (-65.0, 0.0), (-40.0, 0.0), (0.0, 0.0), (0.0, -40.0), (300.0, -40.0),
            (300.0, 0.0), (340.0, 0.0), (365.0, 0.0), (365.0, 600.0), (340.0, 600.0), (300.0, 600.0),
        ].into();
        assert_eq!(union_contour(300.0, 600.0, 40.0, 25.0, false), complex);
    }

    /// The folded piece is the flat pattern's own faces folding: returns
    /// rise to the wall height, mounting lips fold back out horizontal.
    #[test]
    fn folding_rises_returns_and_folds_lips_out() {
        let spec = &SPECS[0];
        let faces = cassette_faces(spec);

        let t0 = fold_transforms(&faces, 0.0);
        for (f, tr) in faces.iter().zip(&t0) {
            for &p in &f.pts {
                let w = tr.apply([p.0, p.1, 0.0]);
                assert!((w[0] - p.0).abs() < 1e-4 && (w[1] - p.1).abs() < 1e-4 && w[2].abs() < 1e-4, "flat at fold 0, got {w:?}");
            }
        }

        let t1 = fold_transforms(&faces, 1.0);
        let top_outer = t1[1].apply([spec.a / 2.0, spec.b + spec.r, 0.0]);
        assert!((top_outer[2] - spec.r).abs() < 1e-3, "top return rises to z=r, got {top_outer:?}");
        let lip_pt = t1[5].apply([-(spec.r + spec.lip), spec.b / 2.0, 0.0]);
        assert!((lip_pt[2] - spec.r).abs() < 1e-3, "lip stays at wall height, got {lip_pt:?}");
        assert!(lip_pt[0] < -1e-3, "lip folds outward, got {lip_pt:?}");
        // Mirror side: the right return rises at x=a and its lip folds out.
        let right_outer = t1[4].apply([spec.a + spec.r, spec.b / 2.0, 0.0]);
        assert!((right_outer[2] - spec.r).abs() < 1e-3 && (right_outer[0] - spec.a).abs() < 1e-3, "right return rises at x=a, got {right_outer:?}");
        let rip_pt = t1[6].apply([spec.a + spec.r + spec.lip, spec.b / 2.0, 0.0]);
        assert!((rip_pt[2] - spec.r).abs() < 1e-3, "right lip stays at wall height, got {rip_pt:?}");
        assert!(rip_pt[0] > spec.a + 1e-3, "right lip folds outward, got {rip_pt:?}");
    }

    /// Every folded projection stays on a sane canvas at any fold progress.
    #[test]
    fn folded_projection_bounded() {
        for spec in SPECS.iter() {
            for &tf in &[0.0f32, 0.5, 1.0, 1.15] {
                let faces = cassette_faces(spec);
                let tr = fold_transforms(&faces, tf);
                for (f, t) in faces.iter().zip(&tr) {
                    let mut pts = f.pts.clone();
                    for &(c, rad) in &f.holes {
                        pts.extend([(c.0 + rad, c.1), (c.0 - rad, c.1), (c.0, c.1 + rad), (c.0, c.1 - rad)]);
                    }
                    for p in pts {
                        let w = t.apply([p.0, p.1, 0.0]);
                        assert!(
                            w[0].abs() < 5000.0 && w[1].abs() < 5000.0 && w[2].abs() < 5000.0,
                            "spec {} at t={tf}: point {p:?} -> {w:?}", spec.id
                        );
                    }
                }
            }
        }
    }
}

impl Scene for CutScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(DUR_S[4])
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(CROSS)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);
        let spec = &SPECS[0];
        let (hx, hy) = placement_center(HERO);

        // The cut opens on the nest's exact final framing (identity sheet
        // transform), then the camera pushes onto the hero and pans it to
        // (820, 500), and pulls back again as the piece frees.
        let zr = ramp(&frame, CROSS);
        let push_k = lerp(1.0, 2.15, zr);
        let zoom_k = lerp(push_k, 0.72, ramp(&frame, 3.0));
        let sheet_tx = lerp(hx, 820.0, zr) - hx * zoom_k;
        let sheet_ty = lerp(hy, 500.0, zr) - hy * zoom_k;
        let sheet_gone = 1.0 - ramp(&frame, 3.6);

        // Cut walk on the hero contour (piece-local px).
        let s_local = NEST_S * zoom_k;
        let ctr = centered_contour(spec.a, spec.b, spec.r, spec.lip, spec.hangers, s_local);
        let per = contour_length(&ctr);
        let p = frame.animate(&fframes::timeline!(
            at 0.4 => 2.3, animate 0.0_f32 => 1.0, EASE_IN_OUT,
        ));
        let freed = frame.animate(&fframes::timeline!(
            at 2.35 => 2.85, animate 0.0_f32 => 1.0, EASE_OUT_EXPO,
        ));
        let (px, py) = polyline_walk(&ctr, p);
        let (fx, fy) = (26.0 * freed, -26.0 * freed);
        let sparks: Vec<Svgr> = (0..6)
            .map(|k| {
                let ang = k as f32 * std::f32::consts::TAU / 6.0 + (t * 9.0).sin() * 0.2;
                let len = 9.0 + 5.0 * (t * 13.0 + k as f32).sin();
                let (dx1, dy1) = (ang.cos() * 10.0, ang.sin() * 10.0);
                let (dx2, dy2) = (ang.cos() * (10.0 + len), ang.sin() * (10.0 + len));
                fframes::svgr!(<path d={format!("M{dx1:.1} {dy1:.1} L{dx2:.1} {dy2:.1}")} stroke={FOLD} stroke-width="2.5" stroke-linecap="round" opacity={0.85 * (1.0 - freed)} />)
            })
            .collect();

        // Fold the freed piece up — starting as the exact placed flat
        // drawing (flatten 1 at fold 0) — then fly it into the wall while
        // the scale settles to the wall cell size.
        let fold: f32 = frame.animate_runtime(AnimateRuntimeInput { on_second: 2.95, from: 0.0, to: 1.0, animation_runtime: &RT_FOLD });
        let flatten = (1.0 - fold).clamp(0.0, 1.0);
        let flat_gone = 1.0 - ramp(&frame, 3.1);
        let fly = frame.animate_runtime(AnimateRuntimeInput { on_second: 4.3, from: 0.0, to: 1.0, animation_runtime: &RT_EASE_IN_OUT });
        let cell = wall_cell_center(2, 1);
        let hero_from = (sheet_tx + hx * zoom_k + 26.0, sheet_ty + hy * zoom_k + 26.0);
        let hero_pos = lerp_pt(hero_from, cell, fly);
        let hero_rot = lerp(90.0, 0.0, fly);
        let s_fold = lerp(NEST_S * zoom_k, WALL_CELL_SCALE, ramp(&frame, 3.4));
        let detail = nest_detail(spec);

        let hero_svg = fframes::svgr!(
            <g transform={format!("translate({:.1} {:.1})", hero_pos.0, hero_pos.1)}>
                <g transform={format!("rotate({hero_rot:.2})")}>
                    <g transform={format!("translate({fx:.1} {fy:.1})")} opacity={flat_gone}>
                        {flat_piece(spec, &FlatOpts { scale: s_local, cut_w: 1.8 * zoom_k, detail, mark: None, body_fill: SURFACE })}
                        <path d={poly_path(&ctr)} fill="none" stroke={CUT} stroke-width={3.0 * zoom_k} stroke-dasharray={per} stroke-dashoffset={per * (1.0 - p)} />
                        <g transform={format!("translate({:.1} {:.1})", px, py)} opacity={(1.0 - freed).max(0.0) * ramp_fast(&frame, 0.4)}>
                            <circle r="26" fill={CUT} opacity="0.25" />
                            <circle r="9" fill={CUT} />
                            <circle r="3" fill={INK} />
                            {sparks}
                        </g>
                    </g>
                    <g opacity={ramp(&frame, 2.95)}>
                        {folded_piece(spec, s_fold, fold.clamp(0.0, 1.15), flatten, false)}
                    </g>
                </g>
            </g>
        );

        // The facade wall assembles from this run's pieces. No piece marks
        // here: nest fades them out before the handoff, so the sheet arrives
        // clean and the zoom never sweeps text off the canvas.
        let wall_o = ramp(&frame, 3.1);
        let mut neighbors: Vec<Svgr> = vec![];
        for i in 0..NESTED {
            if i != HERO {
                neighbors.push(placed_piece(i, 1.8, 0.0));
            }
        }
        let mut wall_parts: Vec<Svgr> = vec![];
        for row in 0..3usize {
            for col in 0..4usize {
                if col == 2 && row == 1 {
                    continue; // the hero's cell
                }
                let spec_i = match (col + row) % 3 {
                    0 => 0,
                    1 => 2,
                    _ => 1,
                };
                let t0 = 3.2 + ((col * 3 + row) % 9) as f32 * 0.14;
                let wk = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 0.0, to: 1.0, animation_runtime: &RT_SPRING });
                let c = wall_cell_center(col, row);
                let drift = 3.0 * breathe(t, 7.0);
                let accent = (col == 1 && row == 2) || (col == 3 && row == 0);
                wall_parts.push(fframes::svgr!(
                    <g opacity={wk} transform={format!("translate({:.1} {:.1}) scale({:.3})", c.0, c.1 + drift + (1.0 - wk) * 40.0, 0.7 + 0.3 * wk)}>
                        {folded_piece(&SPECS[spec_i], WALL_CELL_SCALE / (0.7 + 0.3 * wk), 1.0, 0.0, accent)}
                    </g>
                ));
            }
        }
        let wall_svg = fframes::svgr!(<g opacity={wall_o}>{wall_parts}</g>);

        // End line closes the loop.
        let settle = ramp(&frame, 5.0);
        let spin_t = t.min(5.0);
        let spin_raw = 2.0 * std::f32::consts::PI * spin_t / (1.6 * 4.0);
        let spin = (spin_raw - (spin_raw / std::f32::consts::FRAC_PI_2).floor() * std::f32::consts::FRAC_PI_2) * (1.0 - settle);
        let end = fframes::svgr!(
            <g opacity={ramp(&frame, 4.9)} transform={Transform::translate(0.0, rise(&frame, 4.9, 26.0))}>
                {logo(154.0, 866.0, 52.0, "end", spin)}
                <text x="228" y="906" font-family={SANS} font-size="52" font-weight={W_BOLD} fill={INK} letter-spacing="-2">"Perigram"</text>
                <text x="475" y="906" font-family={SANS} font-size="52" font-weight={W_BOLD} fill={ACCENT} letter-spacing="-2">"Facade"</text>
                <text x="228" y="950" font-family={MONO} font-size="22" font-weight={W_REG} fill={MUTED} letter-spacing="1">"PARAMETRIC CASSETTES — DESIGN TO PRODUCTION"</text>
            </g>
        );

        fframes::svgr!(
            <g opacity={o} transform={camera(&frame)}>
                <g opacity={sheet_gone} transform={format!("translate({sheet_tx:.1} {sheet_ty:.1}) scale({zoom_k:.3})")}>
                    {sheet_svg(1.0)}
                    {neighbors}
                </g>
                {hero_svg}
                {wall_svg}
                {end}
            </g>
        )
    }
}
