This spec is human-write only. 

This project gets migrated from cnc-domain to process programming with "cts" types in Process Designer. Everything that is legacy (hardcoded
"entities" and "services") should be replaced.


## CTS and Process Designer node interface

Designer should operate CTS, it's syntax should be represented fully in nodes. Since it's
programming environment, it should be the cleanest and most elegant thing ever seen. Types,
operations, architecture, mapping cts to interface, nodes UI/UX: contracts/layouts/etc unified, core behavior tested, all the legacy removed, all architectural inconsistencies cleaned. Nodes represent CTS, ensure anything can be programmed with it. Types created, instances mutated/deleted, fields modified, data structures managed, and so on.


## UI

All UI is written in raw, unmodified PrimeVue plus the repo's registered
shared primitives. No hand-rolled div/button chrome, no custom controls.
Raw IDs and other technical identifiers are never shown in user-facing UI.

Process designer palette: a searchable grid of chips, no icons. Operation
categories (palette chips and canvas nodes alike) are told apart by shared
signal styling, not icons or headers — the palette entry looks like the
node it creates.

Node layouts stay simple: a literal is one row (type dropdown + value;
multiline data wraps below at the node's max width). Operation node width
follows its socket names — input and output columns keep a fixed gap,
names crop at a max length, the node title likewise.

Role management: renaming and deleting a role are menu actions, never
first-plane. Deleting warns first when the role carries load in any
definition (its lane, grants, screens, or actions). Screens are not a
separate tab — they render per role under Roles.

Popups (profile/org settings, org/user previews, floating call window,
status badges) are raw PrimeVue: Popover/StandardDialog own the surface
and chrome, no hand-rolled borders or !utility overrides on PrimeVue
internals.

Mobile devices scale the whole UI through the root font-size (the rem
basis PrimeVue components and the typography roles share). Mobile record
opens ROUTE to the compiled detail screen — no popup middleman.

Process definition nodes should generate render contracts, that go to procedural UI generator. Need
correct data bindings, and everything speaks contracts. Current Home workspace ideas should be
preserved (panes and sidebar w/ chats and calls). "Screens" should go to panes/tabs, top-level menu still
in sidebar listbox (but everything rewritten to contracts). 
What currently is "entity chat" should be renamed to "comments" and get it's place in generated UI.
I'm not currently sure how exactly, probably contract should pass "comments" toggle and it gets
generated in same manner in UI. Important to find proper PrimeVue components for it and integrate to
layout. More important to get aligned with architecture, so it's only assumptions.
No per-entity hardcoded components. Editors/previews bind through pack editor bindings and the
surface registry — adding a type never touches app UI code. Files are CTS types with payload traits;
the `artifact` entity and its overload die when chat/proof/capture/upload flows move to file instances.

## Chat files

Any file may be attached to chat messages. Images and videos preview inline
(single items and their sets as galleries); every attachment offers a
download. When a message belongs to an instance chat, each attached file
becomes an instance of the instance's class' declared child type that
accepts its upload (payload traits + upload creation protocol); the sender
picks the child type when several accept the same file. Instance chats
whose target declares no accepting child refuse the upload at pick time;
common chats (support/direct/group) and party-target chats (the
organization chat) keep files as plain unlinked attachments.

## Server

A type is executable from its declaration alone: generic instance services serve everything,
storage is per-class collections. CNC (and every domain) is a removable pack — unmounting it
removes the domain, nothing framework-shaped imports it. Commands/tasks remain declared operator
contracts; legacy feature modules and their API routes are deleted together with their UI flows,
not kept as fallbacks.

## Vocabulary

One vocabulary end to end: `typeId`/`id` on the wire, in stores, in components — including shared
component props. `entityType` names disappear with the compiler-plane cut.

## Legacy policy

No fallbacks, no dual paths, no resurrection of deleted domain types. Old persisted data authored
against deleted types is abandoned; orgs re-author on declarations. Deleting a legacy surface is
complete when its feature module, API routes, and specs go in the same cut.

## Done means

Golden checks green on the integration branch (framework suites, design system, manifest
regenerated), e2e rewritten against generated screens, no known-failure carryover between sessions,
and READMEs (including SYSTEM_ARCHITECTURE) describe the CTS reality.

## IN/OUT org data 

Org process sets type OUT (special node that "published") (for friends or public), recipient gets it's structure and acts as it's allowed by type (resond, etc); reply to OUT dictates next IN stucture. So basically external interaction in process definition is OUT-GAP-IN.    
