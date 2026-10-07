//! PerigramFacade — parametric cassettes, from facade design to production.
//!
//! Visual identity mirrors the app: zinc dark surfaces, IBM Plex Sans/Mono,
//! the Perigram mark (isometric folded cassette, red-orange gradient, with
//! the rotating-core motion from the Rive mark) and the OCCS layer palette
//! from the sheet-design preview styles. Cassette geometry follows the OCCS
//! evaluator's actual output: the flat pattern is the union of the face and
//! four return flanges that each span exactly their parent edge, so the
//! outer contour is a stepped 12-gon with L-shaped corner relief (verified
//! against `evaluateOccsCassetteTemplate` ground truth); fold routes run on
//! the face/flange junctions, integral-cut hanger clips break the top return
//! edge, and the production mark is the name / template id / WP triple.
//! Scenes walk template → bake → nest → sheet design → cut. 1920x1080, 30fps.
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

// Surfaces — the app's dark theme (zinc scale, assets/tokens).
const BG: &str = "#09090b";
const SURFACE: &str = "#18181b";
const SURFACE_2: &str = "#27272a";
const BORDER: &str = "#3f3f46";
const INK: &str = "#fafafa";
const MUTED: &str = "#a1a1aa";
const FAINT: &str = "#71717a";
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
const W_SEMI: u16 = 600;
const W_BOLD: u16 = 700;

const EASE_OUT_EXPO: Easing = Easing::CubicBezier(0.16, 1.0, 0.3, 1.0);
const EASE_IN_OUT: Easing = Easing::CubicBezier(0.65, 0.0, 0.35, 1.0);
const SPRING_SOFT: Easing = Easing::Spring { mass: 1.0, stiffness: 150.0, damping: 18.0 };

static RT_EASE_OUT: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.8, &EASE_OUT_EXPO));
static RT_EASE_IN_OUT: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.7, &EASE_IN_OUT));
static RT_SPRING: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(3.0, &SPRING_SOFT));
static RT_FAST: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.3, &Easing::EaseOut));

/// Cassette face sizes in mm; the outer cut contour adds a folded return
/// flange on every side (`RET_MM`).
struct PieceSpec {
    id: &'static str,
    w: f32,
    h: f32,
}
const PIECES: [PieceSpec; 3] = [
    PieceSpec { id: "PFC-001", w: 300.0, h: 600.0 },
    PieceSpec { id: "PFC-002", w: 300.0, h: 900.0 },
    PieceSpec { id: "PFC-003", w: 200.0, h: 600.0 },
];
const RET_MM: f32 = 40.0;
const SHEET_MM: (f32, f32) = (2500.0, 1250.0);
const NESTED: usize = 9;
const EFFICIENCY: f32 = 67.2;

/// Solver-style placements on the sheet, mm from the sheet's top-left.
/// Rotated pieces (90°) occupy their rotated bounding box at `(x, y)`.
/// Packed by outer contour: P1' 680×380, P2' 980×380, P3' 680×280.
struct Placement {
    piece: usize,
    x: f32,
    y: f32,
    rot: f32,
}
const LAYOUT: [Placement; NESTED] = [
    Placement { piece: 1, x: 20.0, y: 20.0, rot: 90.0 },
    Placement { piece: 0, x: 1020.0, y: 20.0, rot: 90.0 },
    Placement { piece: 0, x: 1720.0, y: 20.0, rot: 90.0 },
    Placement { piece: 0, x: 20.0, y: 420.0, rot: 90.0 },
    Placement { piece: 2, x: 720.0, y: 420.0, rot: 90.0 },
    Placement { piece: 2, x: 1420.0, y: 420.0, rot: 90.0 },
    Placement { piece: 2, x: 20.0, y: 820.0, rot: 90.0 },
    Placement { piece: 2, x: 720.0, y: 820.0, rot: 90.0 },
    Placement { piece: 2, x: 1420.0, y: 820.0, rot: 90.0 },
];

fn outer_mm(spec: &PieceSpec, ret: f32) -> (f32, f32) {
    (spec.w + 2.0 * ret, spec.h + 2.0 * ret)
}

pub struct FacadeVideoVideo<'a> {
    pub media: &'a FacadeVideoMedia,
    title: TitleScene<'a>,
    template: TemplateScene,
    bake: BakeScene,
    nest: NestScene,
    sheet: SheetScene,
    production: ProductionScene,
}

impl<'a> FacadeVideoVideo<'a> {
    pub fn new(media: &'a FacadeVideoMedia, title: &'a str) -> Self {
        Self {
            media,
            title: TitleScene { title },
            template: TemplateScene,
            bake: BakeScene,
            nest: NestScene,
            sheet: SheetScene,
            production: ProductionScene,
        }
    }
}

impl std::fmt::Debug for FacadeVideoVideo<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FacadeVideoVideo").finish()
    }
}

impl Video for FacadeVideoVideo<'_> {
    const FPS: usize = 30;
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
            &self.template,
            &self.bake,
            &self.nest,
            &self.sheet,
            &self.production,
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
                {logo(1668.0, 34.0, 44.0, "chrome", 0.0)}
                <text x="1766" y="66" text-anchor="end" font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} letter-spacing="2">"PERIGRAM / FACADE PACK"</text>
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
    // Rotating core: the face is a true square (±a) in the isometric plane;
    // in-plane rotation by `phase` morphs rhombus → rectangle → rhombus.
    // a = 19.4 reproduces the icon rhombus (width 2e·0.866·…, height 2a).
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

fn rise(frame: &Frame, start: f32, px: f32) -> f32 {
    frame.animate_runtime(AnimateRuntimeInput { on_second: start, from: px, to: 0.0, animation_runtime: &RT_SPRING })
}

/// Whole-scene cross-fade window when scenes overlap.
fn scene_in(t: f32) -> f32 {
    ((t + 0.35) / 0.35).clamp(0.0, 1.0)
}

/// Slow camera push for scene life: 1.0 -> 1.035 across `dur`, plus a soft
/// slide for scene entrances.
fn camera(t: f32, dur: f32) -> String {
    let k = 1.0 + 0.035 * (t / dur).clamp(0.0, 1.0);
    let slide = 42.0 * (1.0 - scene_in(t));
    format!("translate(960 540) scale({k:.4}) translate(-960 -540) translate({slide:.1} 0)")
}

/// Ambient loop 0 -> 1 -> 0 over `period` seconds from video start.
fn breathe(t: f32, period: f32) -> f32 {
    0.5 - 0.5 * (2.0 * std::f32::consts::PI * t / period).cos()
}

fn mono_width<'a>(frame: &mut Frame, ctx: &FFramesContext<'a, '_>, text: &'a str, size: usize, weight: u16) -> f32 {
    frame
        .text_width(ctx, FontQuery { family: MONO, size, weight, ..Default::default() }, text)
        .map(|w| w as f32)
        .unwrap_or(text.len() as f32 * size as f32 * 0.62)
}

/// Geometric estimate for dynamic mono text (IBM Plex Mono advance ≈ 0.6 em).
fn mono_est(text: &str, size: usize) -> f32 {
    text.len() as f32 * size as f32 * 0.60
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

fn scene_label<'a>(num: &'a str, title: &'a str, t: f32, frame: &Frame) -> Svgr<'a> {
    let o = ramp(frame, t);
    let y = rise(frame, t, 22.0);
    fframes::svgr!(
        <g transform={Transform::translate(0.0, y)} opacity={o} font-family={MONO}>
            <rect x="154" y="112" width="56" height="56" rx="10" fill={ACCENT} />
            <text x="182" y="149" text-anchor="middle" font-size="28" font-weight={W_BOLD} fill={BG}>{num}</text>
            <text x="238" y="149" font-size="28" font-weight={W_REG} fill={INK} letter-spacing="4">{title}</text>
        </g>
    )
}

fn caption<'a>(text: &'a str, t: f32, frame: &Frame) -> Svgr<'a> {
    let o = ramp(frame, t);
    fframes::svgr!(
        <g opacity={o}>
            <rect x="154" y="944" width={46.0} height="6" rx="3" fill={ACCENT} />
            <text x="218" y="958" font-family={SANS} font-size="40" font-weight={W_REG} fill={INK}>{text}</text>
        </g>
    )
}

fn chip<'a>(text: &str, w: f32, x: f32, y: f32, color: &'a str) -> Svgr<'a> {
    fframes::svgr!(
        <g>
            <rect x={x} y={y} width={w + 44.0} height="46" rx="23" fill="none" stroke={color} stroke-width="1.5" />
            <text x={x + 22.0} y={y + 31.0} font-family={MONO} font-size="24" font-weight={W_REG} fill={color}>{text.to_string()}</text>
        </g>
    )
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

#[derive(Clone, Copy, PartialEq)]
enum Detail {
    /// Template drawing: stepped contour, T-slot hangers, bolts, 3-line mark.
    Full,
    /// Production piece on a sheet: contour, fold routes, bolts, mark.
    Std,
    /// Small placed piece: contour, fold routes.
    Tiny,
}

struct PatternOpts {
    ret_mm: f32,
    scale: f32,
    cut_w: f32,
    detail: Detail,
    /// Production mark: (template name, template id, workpiece line).
    mark: Option<(&'static str, &'static str, &'static str)>,
    /// Body fill of the flat pattern.
    body_fill: &'static str,
    /// Fill used for through-cut openings so they read as holes.
    cutout_fill: &'static str,
}

/// OCCS outer contour: the union of the face with four return flanges that
/// each span exactly their parent edge. Side returns run the full face
/// height, top/bottom returns only the face width, leaving L-shaped relief
/// steps at the corners — the ground-truth 12-gon from the evaluator.
fn occs_contour(w: f32, h: f32, r: f32) -> Vec<(f32, f32)> {
    let (hw, hh) = (w / 2.0, h / 2.0);
    vec![
        (hw, hh + r),
        (-hw, hh + r),
        (-hw, hh),
        (-hw - r, hh),
        (-hw - r, -hh),
        (-hw, -hh),
        (-hw, -hh - r),
        (hw, -hh - r),
        (hw, -hh),
        (hw + r, -hh),
        (hw + r, hh),
        (hw, hh),
    ]
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

/// Integral-cut hanger clip (hangerClipCutPolygon): a wide notch through the
/// edge with a narrow slot rising into the flange. Centered on `(cx, cy)`.
fn hanger_slot(cx: f32, cy: f32, s: f32) -> String {
    let (half_w, half_slot) = (21.0 * s, 7.35 * s);
    let (top, bottom, notch) = (cy + 14.0 * s, cy - 14.0 * s, cy + 2.0 * s);
    format!("M{:.2} {bottom:.2} L{:.2} {bottom:.2} L{:.2} {notch:.2} L{:.2} {notch:.2} L{:.2} {top:.2} L{:.2} {top:.2} L{:.2} {notch:.2} L{:.2} {notch:.2} Z",
        cx - half_w, cx + half_w, cx + half_w, cx + half_slot, cx + half_slot, cx - half_slot, cx - half_slot, cx - half_w)
}

/// Cassette flat pattern centered on (0, 0): the OCCS stepped cut contour,
/// face with fold-route dashes on the flange junctions, bolt holes through
/// the side returns, integral-cut hanger slots breaking the top return edge
/// and the three-line production mark on the root face.
fn flat_pattern<'a>(face_w: f32, face_h: f32, o: &PatternOpts) -> Svgr<'a> {
    let s = o.scale;
    let r = o.ret_mm * s;
    let (fw, fh) = (face_w * s, face_h * s);
    let contour = occs_contour(fw, fh, r);

    let mut extras: Vec<Svgr> = vec![];

    // Fold routes: the four face/flange junctions.
    let dash = (r * 0.3).max(4.0);
    let dash_s = format!("{dash} {}", dash * 0.66);
    extras.push(fframes::svgr!(
        <path d={format!("M{} {:.2} V{:.2}", -fw / 2.0, fh / 2.0, -fh / 2.0)} stroke={FOLD} stroke-width={o.cut_w * 0.8} stroke-dasharray={dash_s.clone()} />
        <path d={format!("M{} {:.2} V{:.2}", fw / 2.0, fh / 2.0, -fh / 2.0)} stroke={FOLD} stroke-width={o.cut_w * 0.8} stroke-dasharray={dash_s.clone()} />
        <path d={format!("M{:.2} {} H{:.2}", -fw / 2.0, fh / 2.0, fw / 2.0)} stroke={FOLD} stroke-width={o.cut_w * 0.8} stroke-dasharray={dash_s.clone()} />
        <path d={format!("M{:.2} {} H{:.2}", -fw / 2.0, -fh / 2.0, fw / 2.0)} stroke={FOLD} stroke-width={o.cut_w * 0.8} stroke-dasharray={dash_s} />
    ));

    // Bolt holes through the left/right return flanges.
    if o.detail != Detail::Tiny && r > 8.0 {
        for sx in [-1.0, 1.0] {
            for sy in [-1.0, 1.0] {
                extras.push(fframes::svgr!(
                    <circle cx={sx * (fw / 2.0 + r / 2.0)} cy={sy * fh / 4.0} r={(3.0 * s).max(2.2)} fill={o.cutout_fill} stroke={CUT} stroke-width={o.cut_w * 0.8} />
                ));
            }
        }
    }

    // Integral-cut hanger clips breaking the top return's outer edge.
    if o.detail == Detail::Full && fw > 200.0 * s && o.ret_mm >= 28.0 {
        for off in [-0.25, 0.25] {
            let cx = off * fw;
            let cy = fh / 2.0 + r - 14.0 * s;
            extras.push(fframes::svgr!(
                <path d={hanger_slot(cx, cy, s)} fill={o.cutout_fill} stroke={CUT} stroke-width={o.cut_w * 0.9} />
            ));
        }
    }

    // Production mark on the root face: name / template id / workpiece.
    if let Some((name, tpl, wp)) = o.mark {
        if fw > 150.0 {
            let big = 22.0_f32.min(fh * 0.10);
            let (mx, my) = (-fw / 2.0 + 8.0, fh / 2.0 - big * 3.4);
            extras.push(fframes::svgr!(
                <text x={mx} y={my} font-family={MONO} font-size={big} font-weight={W_BOLD} fill={MARK}>{name}</text>
                <text x={mx} y={my + big * 1.15} font-family={MONO} font-size={big * 0.78} font-weight={W_REG} fill={MARK}>{tpl}</text>
                <text x={mx} y={my + big * 2.2} font-family={MONO} font-size={big * 0.78} font-weight={W_REG} fill={MARK}>{wp}</text>
            ));
        }
    }

    fframes::svgr!(
        <g>
            <path d={poly_path(&contour)} fill={o.body_fill} stroke={CUT} stroke-width={o.cut_w} />
            <rect x={-fw / 2.0} y={-fh / 2.0} width={fw} height={fh} fill={FACE_BLUE} opacity="0.06" />
            {extras}
        </g>
    )
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

/// Folded cassette in isometric projection, centered on the projected shape
/// centroid. `t_fold` 0 is the OCCS flat pattern (flanges coplanar, stepped
/// corners intact), 1 is the folded tray with all four return flanges up at
/// 90° — the corner steps open into relief gaps, as in real fabrication.
fn folded_cassette<'a>(face_w: f32, face_h: f32, ret_mm: f32, s: f32, t_fold: f32, accent_face: bool) -> Svgr<'a> {
    let theta = t_fold * std::f32::consts::FRAC_PI_2;
    let (c, si) = (theta.cos(), theta.sin());
    let (w, h, r) = (face_w, face_h, ret_mm);
    // Project, then recenter on the shape's projected bounding center.
    let raw = |x: f32, y: f32, z: f32| -> (f32, f32) {
        ((x - y) * 0.866 * s, ((x + y) * 0.5 - z) * s)
    };
    let (mut minx, mut miny, mut maxx, mut maxy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for &(x, y, z) in &[(0.0, 0.0, 0.0), (w, 0.0, 0.0), (w, h, 0.0), (0.0, h, 0.0),
        (-r * c, -r * c, r * si), (w + r * c, -r * c, r * si), (w + r * c, h + r * c, r * si), (-r * c, h + r * c, r * si)] {
        let (px, py) = raw(x, y, z);
        minx = minx.min(px); maxx = maxx.max(px);
        miny = miny.min(py); maxy = maxy.max(py);
    }
    let (offx, offy) = (-(minx + maxx) / 2.0, -(miny + maxy) / 2.0);
    let iso = move |x: f32, y: f32, z: f32| -> (f32, f32) {
        let (px, py) = raw(x, y, z);
        (px + offx, py + offy)
    };
    let quad = |pts: [(f32, f32, f32); 4], fill: &str| -> Svgr<'a> {
        let p: Vec<String> = pts.iter().map(|(x, y, z)| {
            let (px, py) = iso(*x, *y, *z);
            format!("{px:.2} {py:.2}")
        }).collect();
        fframes::svgr!(<path d={format!("M{} L{} L{} L{} Z", p[0], p[1], p[2], p[3])} fill={fill.to_string()} stroke={BORDER} stroke-width="1" />)
    };
    let z = r * si;
    let (xr0, xr1, yb0, yb1) = (-r * c, w + r * c, -r * c, h + r * c);

    // At t=0 the flanges are coplanar with the face — the flat pattern.
    if t_fold < 0.02 {
        let solid = "#27272a";
        return fframes::svgr!(<g>
            {quad([(0.0, 0.0, 0.0), (w, 0.0, 0.0), (w, yb0, 0.0), (0.0, yb0, 0.0)], solid)}
            {quad([(0.0, 0.0, 0.0), (0.0, h, 0.0), (xr0, h, 0.0), (xr0, 0.0, 0.0)], solid)}
            {quad([(w, 0.0, 0.0), (w, h, 0.0), (xr1, h, 0.0), (xr1, 0.0, 0.0)], solid)}
            {quad([(0.0, h, 0.0), (w, h, 0.0), (w, yb1, 0.0), (0.0, yb1, 0.0)], solid)}
            {quad([(0.0, 0.0, 0.0), (w, 0.0, 0.0), (w, h, 0.0), (0.0, h, 0.0)], solid)}
        </g>);
    }
    let back = quad([(0.0, 0.0, 0.0), (w, 0.0, 0.0), (w, yb0, z), (0.0, yb0, z)], "#333338");
    let left = quad([(0.0, 0.0, 0.0), (0.0, h, 0.0), (xr0, h, z), (xr0, 0.0, z)], "#2c2c31");
    let face_fill = if accent_face { lerp_hex("#27272a", ACCENT, 0.35) } else { "#27272a".to_owned() };
    let face = quad([(0.0, 0.0, 0.0), (w, 0.0, 0.0), (w, h, 0.0), (0.0, h, 0.0)], &face_fill);
    let right = quad([(w, 0.0, 0.0), (w, h, 0.0), (xr1, h, z), (xr1, 0.0, z)], "#202024");
    let front = quad([(0.0, h, 0.0), (w, h, 0.0), (w, yb1, z), (0.0, yb1, z)], "#26262b");
    fframes::svgr!(<g>
        {back}
        {left}
        {face}
        {right}
        {front}
    </g>)
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

// ---- scene 1: title ----

#[derive(Debug)]
struct TitleScene<'a> {
    title: &'a str,
}

impl Scene for TitleScene<'_> {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(4.5)
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);

        // Facade elevation assembling from folded cassettes flying in from depth.
        let (cols, rows) = (5, 4);
        let (pw, ph, pr) = (100.0, 70.0, 16.0);
        let (gap_x, gap_y) = (22.0, 30.0);
        let (ox, oy) = (990.0, 300.0);
        let drift = 4.0 * breathe(t, 7.0);
        let mut panels: Vec<Svgr> = vec![];
        for r in 0..rows {
            for c in 0..cols {
                let i = r * cols + c;
                let start = 0.2 + (c + r) as f32 * 0.09;
                let p = ramp(&frame, start);
                let scale_in = (0.62 + 0.38 * p).max(0.5);
                let x = ox + c as f32 * (pw + ph) * 0.866 * 0.92 + c as f32 * gap_x;
                let y = oy + r as f32 * ((pw + ph) / 2.0 * 0.92 + pr) + r as f32 * gap_y + drift + (1.0 - p) * 46.0;
                let accent_piece = i == 7 || i == 13;
                panels.push(fframes::svgr!(
                    <g opacity={p} transform={format!("translate({x} {y}) scale({scale_in})")}>
                        {folded_cassette(pw, ph, pr, 0.92, 1.0, accent_piece)}
                    </g>
                ));
            }
        }

        // Word-by-word wordmark with the rotating-core mark above.
        let spin = 2.0 * std::f32::consts::PI * t / (1.6 * 4.0);
        let words: Vec<(&str, bool)> = match self.title.find("Facade") {
            Some(idx) => vec![(&self.title[..idx], false), (&self.title[idx..], true)],
            None => vec![(self.title, false)],
        };
        let size = fit_size(&mut frame, ctx, self.title, 128, 740);
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
            <g opacity={o} transform={camera(t, 4.5)}>
                {panels}
                <g transform={Transform::translate(0.0, rise(&frame, 0.0, 24.0))} opacity={ramp(&frame, 0.05)}>
                    {logo(154.0, 330.0, 120.0, "title", spin)}
                </g>
                {word_texts}
                <path d="M154 616 H1620" stroke={SURFACE_2} stroke-width="2" />
                <rect x="154" y="615" width={line} height="3" fill={ACCENT} />
                <text x="154" y="684" font-family={MONO} font-size="28" font-weight={W_REG} fill={MUTED} letter-spacing="1" opacity={ramp(&frame, 0.7)}>{sub}</text>
                <text x="154" y="750" font-family={MONO} font-size="24" font-weight={W_REG} fill={FAINT} letter-spacing="2" opacity={ramp(&frame, 1.0)}>"OCCS TEMPLATES / NESTING / DXF"</text>
            </g>
        )
    }
}

// ---- scene 2: author the template ----

#[derive(Debug)]
struct TemplateScene;

impl Scene for TemplateScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(10.0)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(0.35)
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);

        let a = frame.animate(&fframes::timeline!(
            at 0.4 => 1.6, animate 180.0_f32 => 300.0, EASE_IN_OUT,
        ));
        let b = frame.animate(&fframes::timeline!(
            at 2.0 => 3.4, animate 360.0_f32 => 600.0, EASE_IN_OUT,
        ));
        let r = frame.animate(&fframes::timeline!(
            at 3.8 => 4.8, animate 20.0_f32 => 40.0, EASE_IN_OUT,
        ));

        // The drawing, centered left, with the full production anatomy.
        let (cx, cy, s) = (600.0, 570.0, 0.62);
        let (fw, fh, rp) = (a * s, b * s, r * s);
        let (ow, oh) = (fw + 2.0 * rp, fh + 2.0 * rp);
        let draw_o = ramp(&frame, 0.2);
        // Pulse the contour when a parameter settles.
        let settling = [1.6f32, 3.4, 4.8].iter().any(|&te| (t - te).abs() < 0.35);
        let glow = if settling { 2.0 } else { 0.0 };
        let drawing = fframes::svgr!(
            <g transform={Transform::translate(cx, cy)} opacity={draw_o}>
                {flat_pattern(a, b, &PatternOpts { ret_mm: r, scale: s, cut_w: 3.0 + glow, detail: Detail::Full, mark: Some(("FCT-01", "tpl_8842", "WP 1")), body_fill: SURFACE, cutout_fill: BG })}
                {dim_h(-ow / 2.0, ow / 2.0, oh / 2.0 + 34.0, "A", 30.0)}
                {dim_v(-oh / 2.0, oh / 2.0, ow / 2.0 + 34.0, "B", 30.0)}
                {dim_h(fw / 2.0, ow / 2.0, -oh / 2.0 - 16.0, "R", 22.0)}
            </g>
        );

        // Parameter panel with a live folded preview that slowly yaws.
        let prev_scale = (200.0 / ((a + b) * 0.866)).clamp(0.12, 0.42);
        let yaw = 6.0 * breathe(t, 6.0) - 3.0;
        let rows: Vec<Svgr> = [("A", "width", a, 180.0, 300.0, 0.4, 1.6), ("B", "height", b, 360.0, 600.0, 2.0, 3.4), ("R", "return", r, 20.0, 40.0, 3.8, 4.8)]
            .iter()
            .enumerate()
            .map(|(i, &(name, label, val, min, max, t0, t1))| {
                let y = 580.0 + i as f32 * 112.0;
                let ro = ramp(&frame, 0.6 + i as f32 * 0.12);
                let changing = t >= t0 - 0.05 && t <= t1 + 0.2;
                let norm = ((val - min) / (max - min) * 452.0).max(0.5);
                let color = if changing { ACCENT } else { INK };
                fframes::svgr!(
                    <g opacity={ro} transform={Transform::translate(0.0, rise(&frame, 0.6 + i as f32 * 0.12, 26.0))}>
                        <text x="1282" y={y} font-family={SANS} font-size="30" font-weight={W_SEMI} fill={INK}>{format!("{name} · {label}")}</text>
                        <text x="1734" y={y + 4.0} text-anchor="end" font-family={MONO} font-size="48" font-weight={W_BOLD} fill={color}>{format!("{val:.0}")}</text>
                        <rect x="1282" y={y + 22.0} width="452" height="4" rx="2" fill={SURFACE_2} />
                        <rect x="1282" y={y + 22.0} width={norm} height="4" rx="2" fill={color} />
                    </g>
                )
            })
            .collect();
        let panel_o = ramp(&frame, 0.35);
        let panel = fframes::svgr!(
            <g opacity={panel_o} transform={Transform::translate(0.0, rise(&frame, 0.35, 40.0))}>
                <rect x="1250" y="250" width="516" height="590" rx="20" fill={SURFACE} stroke={BORDER} />
                <text x="1282" y="306" font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} letter-spacing="6">"PARAMETERS"</text>
                <rect x="1282" y="330" width="452" height="216" rx="12" fill={BG} stroke={SURFACE_2} />
                <g transform={format!("translate(1508.0 438.0) rotate({yaw:.2})")} opacity={ramp(&frame, 0.5)}>
                    {folded_cassette(a, b, r, prev_scale, 1.0, false)}
                </g>
                {rows}
            </g>
        );

        // Layer legend.
        let mut legend: Vec<Svgr> = vec![];
        {
            let mut lx = 154.0f32;
            for (idx, &(name, color)) in [("cut.outer", CUT), ("fold.route", FOLD), ("hanger_clip", CUT), ("code.cassette_mark", MARK)].iter().enumerate() {
                let w = mono_width(&mut frame, ctx, name, 24, W_REG);
                let swatch = if name == "hanger_clip" {
                    fframes::svgr!(<path d={hanger_slot(lx + 10.0, 880.0, 0.34)} fill="none" stroke={color} stroke-width="2" />)
                } else if name == "code.cassette_mark" {
                    fframes::svgr!(<text x={lx} y="888" font-family={MONO} font-size="24" font-weight={W_BOLD} fill={color}>"M"</text>)
                } else if name == "fold.route" {
                    fframes::svgr!(<path d={format!("M{lx} 880 H{}", lx + 34.0)} stroke={color} stroke-width="2.5" stroke-dasharray="7 4" />)
                } else {
                    fframes::svgr!(<path d={format!("M{lx} 880 H{}", lx + 34.0)} stroke={color} stroke-width="2.5" />)
                };
                legend.push(fframes::svgr!(
                    <g opacity={ramp(&frame, 5.2 + idx as f32 * 0.12)}>
                        {swatch}
                        <text x={lx + 46.0} y="888" font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED}>{name}</text>
                    </g>
                ));
                lx += 46.0 + w + 44.0;
            }
        }

        fframes::svgr!(
            <g opacity={o} transform={camera(t, 10.0)}>
                {scene_label("01", "AUTHOR THE TEMPLATE", 0.1, &frame)}
                {drawing}
                {panel}
                {legend}
                {caption("One OCCS template — geometry is a function of its parameters.", 6.6, &frame)}
            </g>
        )
    }
}

// ---- scene 3: bake production pieces ----

#[derive(Debug)]
struct BakeScene;

impl Scene for BakeScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(9.0)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(0.35)
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);

        // Template card: the flat-pattern drawing with expression dims.
        let tmpl_o = ramp(&frame, 0.2);
        let tmpl = fframes::svgr!(
            <g opacity={tmpl_o} transform={Transform::translate(0.0, rise(&frame, 0.2, 40.0))}>
                <rect x="190" y="310" width="320" height="480" rx="16" fill={SURFACE} stroke={BORDER} />
                <rect x="190" y="310" width="320" height="60" rx="16" fill={SURFACE_2} />
                <text x="214" y="348" font-family={MONO} font-size="22" font-weight={W_BOLD} fill={INK}>"FCT-01 · TEMPLATE"</text>
                <g transform={Transform::translate(350.0, 570.0)}>
                    {flat_pattern(PIECES[0].w, PIECES[0].h, &PatternOpts { ret_mm: RET_MM, scale: 0.28, cut_w: 2.0, detail: Detail::Std, mark: Some(("FCT-01", "A · B", "")), body_fill: SURFACE_2, cutout_fill: SURFACE })}
                    {dim_h(-53.0, 53.0, 116.0, "A", 20.0)}
                    {dim_v(-102.0, 102.0, 78.0, "B", 20.0)}
                </g>
                <text x="350" y="764" text-anchor="middle" font-family={MONO} font-size="20" font-weight={W_REG} fill={MUTED}>".occs graph"</text>
            </g>
        );

        // Baked cassette-design cards: the folded piece you get, gently bobbing.
        let cards: Vec<Svgr> = PIECES
            .iter()
            .enumerate()
            .map(|(i, spec)| {
                let t0 = 1.2 + i as f32 * 1.3;
                let x = 640.0 + i as f32 * 420.0;
                let co = ramp(&frame, t0 + 0.45);
                let settle = frame.animate_runtime(AnimateRuntimeInput {
                    on_second: t0 + 0.45,
                    from: 0.0,
                    to: 1.0,
                    animation_runtime: &RT_SPRING,
                });
                let scale = 1.0 - 0.08 * (1.0 - settle);
                let ry = rise(&frame, t0 + 0.45, 36.0);
                let bob = 2.5 * breathe(t - t0, 3.4 + i as f32 * 0.5) * settle;
                let dot_pulse = 0.5 + 0.5 * (std::f32::consts::PI * t / 1.2 + i as f32).sin();
                let iso_w = (spec.w + spec.h) * 0.866;
                let iso_h = (spec.w + spec.h) * 0.5 + 2.0 * RET_MM;
                let fs = (250.0 / iso_w).min(230.0 / iso_h);
                fframes::svgr!(
                    <g opacity={co} transform={format!("translate({x} {ry}) scale({scale})")}>
                        <rect x="0" y="310" width="340" height="480" rx="16" fill={SURFACE} stroke={BORDER} />
                        <rect x="0" y="310" width="340" height="60" rx="16" fill={SURFACE_2} />
                        <circle cx="312" cy="340" r="7" fill="#22c55e" opacity={0.55 + 0.45 * dot_pulse} />
                        <text x="24" y="348" font-family={MONO} font-size="22" font-weight={W_BOLD} fill={INK}>{spec.id}</text>
                        <g transform={format!("translate(170.0 {}) ", 540.0 + bob)}>
                            {folded_cassette(spec.w, spec.h, RET_MM, fs, 1.0, false)}
                        </g>
                        <text x="170" y="742" text-anchor="middle" font-family={MONO} font-size="22" font-weight={W_REG} fill={MUTED}>{format!("{} × {} · baked", spec.w as usize, spec.h as usize)}</text>
                        <text x="170" y="772" text-anchor="middle" font-family={MONO} font-size="20" font-weight={W_REG} fill={FAINT}>"fixed for production"</text>
                    </g>
                )
            })
            .collect();

        // Parameter pills flying from the template into each bake.
        let pills: Vec<Svgr> = PIECES
            .iter()
            .enumerate()
            .map(|(i, spec)| {
                let t0 = 1.2 + i as f32 * 1.3;
                let x1 = 640.0 + i as f32 * 420.0 + 60.0;
                let p = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 0.0, to: 1.0, animation_runtime: &RT_EASE_IN_OUT });
                let x = 510.0 + (x1 - 510.0) * p;
                let y = 460.0 - 70.0 * (std::f32::consts::PI * p).sin();
                let appear = ramp(&frame, t0) * (1.0 - ramp(&frame, t0 + 0.42));
                let text = format!("A={} · B={}", spec.w as usize, spec.h as usize);
                let w = mono_est(&text, 24);
                fframes::svgr!(
                    <g opacity={appear.min(1.0)} transform={Transform::translate(x, y)}>
                        {chip(&text, w, 0.0, 0.0, MARK)}
                    </g>
                )
            })
            .collect();

        let ev_text = "evaluateOccsCassetteTemplate";
        let ev_w = mono_width(&mut frame, ctx, ev_text, 22, W_REG);

        fframes::svgr!(
            <g opacity={o} transform={camera(t, 9.0)}>
                {scene_label("02", "BAKE PRODUCTION PIECES", 0.1, &frame)}
                {tmpl}
                {cards}
                {pills}
                <g opacity={ramp(&frame, 0.6)}>
                    {chip(ev_text, ev_w, 190.0, 826.0, MUTED)}
                </g>
                {caption("Evaluated once at construction — later template edits never propagate.", 6.0, &frame)}
            </g>
        )
    }
}

// ---- scene 4: nest the sheet ----

#[derive(Debug)]
struct NestScene;

impl Scene for NestScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(11.0)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(0.35)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);

        // Material sheet, mm at 0.5 px/mm.
        let (sx, sy, s) = (154.0, 265.0, 0.5);
        let (sh_w, sh_h) = (SHEET_MM.0 * s, SHEET_MM.1 * s);
        let sheet_o = ramp(&frame, 0.2);
        let sheet = fframes::svgr!(
            <g opacity={sheet_o}>
                <text x={sx} y={sy - 18.0} font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} letter-spacing="2">{format!("MATERIAL SHEET · {} × {} MM", SHEET_MM.0 as usize, SHEET_MM.1 as usize)}</text>
                <rect x={sx} y={sy} width={sh_w} height={sh_h} fill={BG} stroke={SHEET_LINE} stroke-width="2" stroke-dasharray="10 6" />
            </g>
        );

        // Placed pieces flying in, biggest first, with a landing pulse.
        let pieces: Vec<Svgr> = LAYOUT
            .iter()
            .enumerate()
            .map(|(i, pl)| {
                let spec = &PIECES[pl.piece];
                let (ow, oh) = outer_mm(spec, RET_MM);
                let (bw, bh) = if pl.rot != 0.0 { (oh, ow) } else { (ow, oh) };
                let tx = sx + (pl.x + bw / 2.0) * s;
                let ty = sy + (pl.y + bh / 2.0) * s;
                let t0 = 1.4 + i as f32 * 0.42;
                let cx = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 2150.0, to: tx, animation_runtime: &RT_EASE_IN_OUT });
                let cy = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: ty - 40.0, to: ty, animation_runtime: &RT_EASE_IN_OUT });
                let rot = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: pl.rot + 14.0, to: pl.rot, animation_runtime: &RT_SPRING });
                let po = frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 0.0, to: 1.0, animation_runtime: &RT_FAST });
                let mark_o = ramp(&frame, t0 + 0.55);
                let ring_p = ramp(&frame, t0 + 0.5);
                let ring_r = 10.0 + 26.0 * ring_p;
                let detail = if bw * s > 260.0 { Detail::Std } else { Detail::Tiny };
                fframes::svgr!(
                    <g opacity={po} transform={format!("translate({cx} {cy})")}>
                        <circle r={ring_r} fill="none" stroke={ACCENT} stroke-width="2" opacity={0.5 * (1.0 - ring_p)} />
                        <g transform={format!("rotate({rot})")}>
                            {flat_pattern(spec.w, spec.h, &PatternOpts { ret_mm: RET_MM, scale: s, cut_w: 1.8, detail, mark: None, body_fill: SURFACE, cutout_fill: BG })}
                        </g>
                        <text x={-bw * s / 2.0 + 6.0} y={bh * s / 2.0 - 7.0} font-family={MONO} font-size="17" font-weight={W_REG} fill={MARK} opacity={mark_o}>{spec.id}</text>
                    </g>
                )
            })
            .collect();

        // Stats column with a sweeping efficiency gauge.
        let eff = EFFICIENCY * frame.animate(&fframes::timeline!(
            at 5.0 => 7.0, animate 0.0_f32 => 1.0, EASE_OUT_EXPO,
        ));
        let gauge = 2.0 * std::f32::consts::PI * (eff / 100.0).clamp(0.0, 1.0);
        let stats: Vec<Svgr> = [("PIECES", format!("{NESTED}")), ("SHEETS", "1".to_owned()), ("EFFICIENCY", format!("{eff:.1}%"))]
            .iter()
            .enumerate()
            .map(|(i, (label, value))| {
                let y = 380.0 + i as f32 * 120.0;
                let gauge_arc = if *label == "EFFICIENCY" {
                    let r = 14.0f32;
                    let (gx, gy) = (1698.0, y + 40.0);
                    let large = if gauge > std::f32::consts::PI { 1 } else { 0 };
                    let (ex, ey) = (gx + r * gauge.sin(), gy - r * gauge.cos());
                    fframes::svgr!(
                        <circle cx={gx} cy={gy} r={r} fill="none" stroke={SURFACE_2} stroke-width="5" />
                        <path d={format!("M{gx} {} A{r} {r} 0 {large} 1 {ex:.2} {ey:.2}", gy - r)} fill="none" stroke={ACCENT} stroke-width="5" stroke-linecap="round" />
                    )
                } else {
                    Svgr::empty()
                };
                fframes::svgr!(
                    <g opacity={ramp(&frame, 4.4 + i as f32 * 0.15)} transform={Transform::translate(0.0, rise(&frame, 4.4 + i as f32 * 0.15, 24.0))}>
                        <text x="1480" y={y} font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} letter-spacing="3">{*label}</text>
                        <text x="1480" y={y + 62.0} font-family={MONO} font-size="60" font-weight={W_BOLD} fill={INK}>{value.to_string()}</text>
                        {gauge_arc}
                    </g>
                )
            })
            .collect();

        fframes::svgr!(
            <g opacity={o} transform={camera(t, 11.0)}>
                {scene_label("03", "NEST THE SHEET", 0.1, &frame)}
                {sheet}
                {pieces}
                {stats}
                {caption("Pure values in, layouts out — the solver packs the sheet.", 7.6, &frame)}
            </g>
        )
    }
}

// ---- scene 5: sheet design & dxf ----

#[derive(Debug)]
struct SheetScene;

impl Scene for SheetScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(8.5)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(0.35)
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t);

        // The sheet-design record card. Sheet scale fits the card body.
        let (card_x, card_y, card_w, card_h) = (154.0, 278.0, 1250.0, 640.0);
        let s = 0.42;
        let (sh_w, sh_h) = (SHEET_MM.0 * s, SHEET_MM.1 * s);
        let sx = card_x + (card_w - sh_w) / 2.0;
        let sy = card_y + 64.0 + (card_h - 64.0 - sh_h) / 2.0;
        let card_o = ramp(&frame, 0.2);
        let pieces: Vec<Svgr> = LAYOUT
            .iter()
            .enumerate()
            .map(|(i, pl)| {
                let spec = &PIECES[pl.piece];
                let (ow, oh) = outer_mm(spec, RET_MM);
                let (bw, bh) = if pl.rot != 0.0 { (oh, ow) } else { (ow, oh) };
                let cx = sx + (pl.x + bw / 2.0) * s;
                let cy = sy + (pl.y + bh / 2.0) * s;
                fframes::svgr!(
                    <g transform={format!("translate({cx} {cy}) rotate({})", pl.rot)}>
                        {flat_pattern(spec.w, spec.h, &PatternOpts { ret_mm: RET_MM, scale: s, cut_w: 1.4, detail: if bw * s > 150.0 { Detail::Std } else { Detail::Tiny }, mark: None, body_fill: SURFACE, cutout_fill: BG })}
                    </g>
                    <text x={cx - bw * s / 2.0 + 5.0} y={cy + bh * s / 2.0 - 6.0} font-family={MONO} font-size="16" font-weight={W_REG} fill={MARK} opacity={ramp(&frame, 1.0 + i as f32 * 0.14)}>{spec.id}</text>
                )
            })
            .collect();

        // LAYOUT_DXF stamp with an impact ring.
        let stamp_in = frame.animate_runtime(AnimateRuntimeInput { on_second: 4.6, from: 1.7, to: 1.0, animation_runtime: &RT_SPRING });
        let ring_p = ramp(&frame, 4.65);
        let ring_r = 60.0 + 110.0 * ring_p;
        let stamp = fframes::svgr!(
            <g>
                <circle cx="1054" cy="700" r={ring_r} fill="none" stroke={ACCENT} stroke-width="3" opacity={0.45 * (1.0 - ring_p)} />
                <g transform={format!("translate(1054 700) rotate(-6) scale({stamp_in})")} opacity={ramp(&frame, 4.6)}>
                    <rect x="-190" y="-46" width="380" height="92" rx="12" fill={ACCENT} opacity="0.12" />
                    <rect x="-190" y="-46" width="380" height="92" rx="12" fill="none" stroke={ACCENT} stroke-width="4" />
                    <text x="0" y="14" text-anchor="middle" font-family={MONO} font-size="40" font-weight={W_BOLD} fill={ACCENT} letter-spacing="2">"LAYOUT_DXF"</text>
                </g>
            </g>
        );
        let dxf_out = frame.animate_runtime(AnimateRuntimeInput { on_second: 5.4, from: 0.0, to: 1.0, animation_runtime: &RT_EASE_IN_OUT });
        let dxf_x = 1230.0 + (1508.0 - 1230.0) * dxf_out;
        let dxf_y = 700.0 + 84.0 * dxf_out - 46.0 * (std::f32::consts::PI * dxf_out).sin();
        let dxf_o = ramp(&frame, 5.35);

        let rows: Vec<Svgr> = [("pieces", format!("{NESTED}")), ("sheets", "1".to_owned()), ("efficiency", format!("{EFFICIENCY:.1}%")), ("kerf", "3.0 mm".to_owned())]
            .iter()
            .enumerate()
            .map(|(i, (label, value))| {
                let y = 396.0 + i as f32 * 86.0;
                fframes::svgr!(
                    <g opacity={ramp(&frame, 1.4 + i as f32 * 0.12)} transform={Transform::translate(0.0, rise(&frame, 1.4 + i as f32 * 0.12, 20.0))}>
                        <text x="1480" y={y} font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED}>{*label}</text>
                        <text x="1766" y={y + 6.0} text-anchor="end" font-family={MONO} font-size="40" font-weight={W_BOLD} fill={INK}>{value.to_string()}</text>
                    </g>
                )
            })
            .collect();

        fframes::svgr!(
            <g opacity={o} transform={camera(t, 8.5)}>
                {scene_label("04", "SHEET DESIGN & DXF", 0.1, &frame)}
                <g opacity={card_o} transform={Transform::translate(0.0, rise(&frame, 0.2, 40.0))}>
                    <rect x={card_x} y={card_y} width={card_w} height={card_h} rx="16" fill={SURFACE} stroke={BORDER} />
                    <rect x={card_x} y={card_y} width={card_w} height="64" rx="16" fill={SURFACE_2} />
                    <text x="186" y="320" font-family={MONO} font-size="26" font-weight={W_BOLD} fill={INK}>"SHEET-01"</text>
                    <text x="1372" y="318" text-anchor="end" font-family={MONO} font-size="22" font-weight={W_REG} fill={MUTED}>"entity_revision · scope: geometry"</text>
                    <rect x={sx} y={sy} width={sh_w} height={sh_h} fill={BG} stroke={SHEET_LINE} stroke-width="2" stroke-dasharray="9 6" />
                    {pieces}
                </g>
                <rect x="1480" y="330" width="286" height="416" rx="16" fill={SURFACE} stroke={BORDER} opacity={ramp(&frame, 1.2)} />
                {rows}
                {stamp}
                <g opacity={dxf_o} transform={Transform::translate(dxf_x, dxf_y)}>
                    {chip("sheet-01.dxf", 130.0, 0.0, 0.0, ACCENT)}
                </g>
                {caption("One immutable geometry revision per physical sheet.", 6.4, &frame)}
            </g>
        )
    }
}

// ---- scene 6: production & recap ----

#[derive(Debug)]
struct ProductionScene;

impl Scene for ProductionScene {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(10.0)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(0.35)
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t) * (1.0 - ((t - 9.3) / 0.7).clamp(0.0, 1.0));

        // Phase A: the laser walks the OCCS contour, the piece frees, then
        // folds up into the finished cassette with a spring overshoot.
        let (cx, cy, s) = (560.0, 480.0, 0.62);
        let spec = &PIECES[0];
        let (ow, oh) = outer_mm(spec, RET_MM);
        let (w, h) = (ow * s, oh * s);
        let r_px = RET_MM * s;
        let contour_pts = occs_contour(w, h, r_px);
        let per = contour_length(&contour_pts);
        let p = frame.animate(&fframes::timeline!(
            at 0.8 => 2.8, animate 0.0_f32 => 1.0, EASE_IN_OUT,
        ));
        let freed = frame.animate(&fframes::timeline!(
            at 2.9 => 3.4, animate 0.0_f32 => 1.0, EASE_OUT_EXPO,
        ));
        let fold = frame.animate(&fframes::timeline!(
            at 3.8, animate 0.0_f32 => 1.0, Easing::Spring { mass: 1.0, stiffness: 120.0, damping: 14.0 },
        ));
        let flat_fade = 1.0 - fold.clamp(0.0, 1.0).min(1.0);
        let (px, py) = polyline_walk(&contour_pts, p);
        let fx = 24.0 * freed;
        let fy = -24.0 * freed;
        let fold_scale = 260.0 / ((spec.w + spec.h) * 0.866);
        // Cutting sparks: short radiating ticks around the head.
        let sparks: Vec<Svgr> = (0..6)
            .map(|k| {
                let ang = k as f32 * std::f32::consts::TAU / 6.0 + (t * 9.0).sin() * 0.2;
                let len = 9.0 + 5.0 * (t * 13.0 + k as f32).sin();
                let (dx1, dy1) = (ang.cos() * 10.0, ang.sin() * 10.0);
                let (dx2, dy2) = (ang.cos() * (10.0 + len), ang.sin() * (10.0 + len));
                fframes::svgr!(<path d={format!("M{dx1:.1} {dy1:.1} L{dx2:.1} {dy2:.1}")} stroke={FOLD} stroke-width="2.5" stroke-linecap="round" opacity={0.85 * (1.0 - freed)} />)
            })
            .collect();
        let cut_a = fframes::svgr!(
            <g opacity={1.0 - ramp(&frame, 5.4)}>
                <text x={cx - w / 2.0} y={cy - h / 2.0 - 28.0} font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} opacity={ramp(&frame, 0.4)}>"cut.outer"</text>
                <g transform={Transform::translate(cx, cy)}>
                    <g transform={format!("translate({fx} {fy})")}>
                        <path d={poly_path(&contour_pts)} fill="#000000" opacity={0.4 * freed} transform={Transform::translate(16.0, 18.0)} />
                        <g opacity={flat_fade}>
                            {flat_pattern(spec.w, spec.h, &PatternOpts { ret_mm: RET_MM, scale: s, cut_w: 4.0, detail: Detail::Full, mark: Some((spec.id, "FCT-01", "WP 1")), body_fill: SURFACE, cutout_fill: BG })}
                        </g>
                        <path d={poly_path(&contour_pts)} fill="none" stroke={CUT} stroke-width="4" stroke-dasharray={per} stroke-dashoffset={per * (1.0 - p)} />
                    </g>
                    <g transform={format!("translate({} {}) scale({})", 40.0 * fold, 150.0 * fold, 1.0)} opacity={fold.clamp(0.0, 1.0)}>
                        {folded_cassette(spec.w, spec.h, RET_MM, fold_scale, fold.clamp(0.0, 1.2), false)}
                    </g>
                    <g transform={format!("translate({} {})", px + fx, py + fy)} opacity={(1.0 - freed).max(0.15)}>
                        <circle r="26" fill={CUT} opacity="0.25" />
                        <circle r="9" fill={CUT} />
                        <circle r="3" fill={INK} />
                        {sparks}
                    </g>
                </g>
                <text x={cx} y={cy + h / 2.0 + 74.0} text-anchor="middle" font-family={MONO} font-size="24" font-weight={W_REG} fill={FAINT} opacity={ramp(&frame, 4.4)}>"fold routes up 90° — the cassette takes shape"</text>
            </g>
        );

        // Phase B: lifecycle recap.
        let line = (1400.0 * frame.animate(&fframes::timeline!(
            at 5.6 => 6.3, animate 0.0_f32 => 1.0, EASE_IN_OUT,
        )))
        .max(0.5);
        let icons = [recap_icon_template(), recap_icon_bake(), recap_icon_nest(), recap_icon_sheet(), recap_icon_cut()];
        let labels = ["TEMPLATE", "BAKE", "NEST", "SHEET", "CUT"];
        let nodes: Vec<Svgr> = icons
            .into_iter()
            .enumerate()
            .map(|(i, icon)| {
                let x = 260.0 + i as f32 * 350.0;
                let t0 = 5.9 + i as f32 * 0.12;
                let scale = 1.0 - 0.12 * (1.0 - frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 0.0, to: 1.0, animation_runtime: &RT_SPRING }));
                fframes::svgr!(
                    <g opacity={ramp(&frame, t0)}>
                        <circle cx={x} cy="430" r="9" fill={ACCENT} />
                        <g transform={format!("translate({x} 330) scale({scale})")}>{icon}</g>
                        <text x={x} y="492" text-anchor="middle" font-family={MONO} font-size="26" font-weight={W_BOLD} fill={INK} letter-spacing="3">{labels[i]}</text>
                    </g>
                )
            })
            .collect();

        let end_size = fit_size(&mut frame, ctx, "PerigramFacade", 84, 860);
        let w1 = frame
            .text_width(ctx, FontQuery { family: SANS, size: end_size, weight: W_BOLD, ..Default::default() }, "Perigram")
            .map(|w| w as f32)
            .unwrap_or(360.0);
        // The mark spins while working, then settles into rest at the end.
        let settle = ramp(&frame, 7.9);
        let spin_t = t.min(7.9);
        let spin_raw = 2.0 * std::f32::consts::PI * spin_t / (1.6 * 4.0);
        let spin = spin_raw - (spin_raw / (std::f32::consts::FRAC_PI_2)).floor() * std::f32::consts::FRAC_PI_2;
        let spin_settled = spin * (1.0 - settle);
        let recap = fframes::svgr!(
            <g>
                <path d="M260 430 H1660" stroke={SURFACE_2} stroke-width="2" />
                <path d="M260 430 H1660" stroke={MUTED} stroke-width="2" stroke-dasharray={line} stroke-dashoffset={(1400.0 - line).max(0.0)} />
                {nodes}
            </g>
        );
        let end = fframes::svgr!(
            <g opacity={ramp(&frame, 7.4)} transform={Transform::translate(0.0, rise(&frame, 7.4, 30.0))}>
                {logo(154.0, 660.0, 64.0, "end", spin_settled)}
                <text x="250" y="712" font-family={SANS} font-size={end_size} font-weight={W_BOLD} fill={INK} letter-spacing="-2">"Perigram"</text>
                <text x={250.0 + w1 - end_size as f32 * 0.02} y="712" font-family={SANS} font-size={end_size} font-weight={W_BOLD} fill={ACCENT} letter-spacing="-2">"Facade"</text>
                <text x="250" y="768" font-family={MONO} font-size="26" font-weight={W_REG} fill={MUTED} letter-spacing="1">"PARAMETRIC CASSETTES — DESIGN TO PRODUCTION"</text>
            </g>
        );

        fframes::svgr!(
            <g opacity={o} transform={camera(t, 10.0)}>
                {scene_label("05", "PRODUCTION", 0.1, &frame)}
                {cut_a}
                {recap}
                {end}
            </g>
        )
    }
}

fn recap_icon_template() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            {folded_cassette(64.0, 44.0, 14.0, 0.9, 1.0, false)}
            <text x="0" y="76" text-anchor="middle" font-family={MONO} font-size="22" font-weight={W_REG} fill={MUTED}>"A · B"</text>
        </g>
    )
}

fn recap_icon_bake() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <rect x="-42" y="-50" width="84" height="100" rx="8" fill={SURFACE} stroke={BORDER} />
            <rect x="-42" y="-50" width="84" height="22" rx="8" fill={SURFACE_2} />
            {folded_cassette(46.0, 30.0, 10.0, 0.75, 1.0, false)}
            <text x="0" y="66" text-anchor="middle" font-family={MONO} font-size="22" font-weight={W_REG} fill={MUTED}>"600"</text>
        </g>
    )
}

fn recap_icon_nest() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <rect x="-54" y="-34" width="108" height="68" fill={BG} stroke={SHEET_LINE} stroke-width="2" stroke-dasharray="7 4" />
            <path d="M-48 -28 H-18 V-2 H-48 Z M-12 -28 H18 V-2 H-12 Z M-48 2 H-18 V28 H-48 Z" fill={SURFACE} stroke={CUT} stroke-width="1.5" />
        </g>
    )
}

fn recap_icon_sheet() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <rect x="-54" y="-34" width="108" height="68" fill={BG} stroke={SHEET_LINE} stroke-width="2" stroke-dasharray="7 4" />
            <path d="M-48 -28 H-4 V0 H-48 Z M2 -28 H46 V0 H2 Z" fill={SURFACE} stroke={CUT} stroke-width="1.5" />
            <rect x="-30" y="14" width="60" height="26" rx="6" fill="none" stroke={ACCENT} stroke-width="2" />
            <text x="0" y="33" text-anchor="middle" font-family={MONO} font-size="18" font-weight={W_BOLD} fill={ACCENT}>"DXF"</text>
        </g>
    )
}

fn recap_icon_cut() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <path d="M-32 -44 H32 V44 H-32 Z" fill={SURFACE} stroke={CUT} stroke-width="2.5" stroke-dasharray="304" stroke-dashoffset="258" />
            <circle cx="-32" cy="-44" r="10" fill={CUT} opacity="0.25" />
            <circle cx="-32" cy="-44" r="5" fill={CUT} />
        </g>
    )
}
