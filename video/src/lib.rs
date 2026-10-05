//! PerigramFacade — parametric cassettes, from facade design to production.
//!
//! Six scenes walk the cassette lifecycle: author the OCCS template, bake
//! cassette-designs at fixed parameter values, nest them onto a material
//! sheet, generate the sheet design with its DXF export, and cut.
//! Drawn on a 1920x1080 grid, 30 fps.
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

const BG: &str = "#0C141D";
const PANEL: &str = "#131F2B";
const PANEL_2: &str = "#182734";
const GRID: &str = "#152230";
const EDGE: &str = "#233446";
const INK: &str = "#E7EEF4";
const MUTED: &str = "#7E93A6";
const CUT: &str = "#FF6B4A";
const FOLD: &str = "#56B4FF";
const DIM: &str = "#8FA6B8";
const MARK: &str = "#FFC53D";

const DISPLAY: &str = "DM Sans";
const MONO: &str = "JetBrains Mono";
const W_MED: u16 = 500;
const W_REG: u16 = 400;
const W_BOLD: u16 = 700;

const EASE_OUT_EXPO: Easing = Easing::CubicBezier(0.16, 1.0, 0.3, 1.0);
const EASE_IN_OUT: Easing = Easing::CubicBezier(0.65, 0.0, 0.35, 1.0);
const SPRING_SOFT: Easing = Easing::Spring { mass: 1.0, stiffness: 150.0, damping: 18.0 };

static RT_EASE_OUT: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.8, &EASE_OUT_EXPO));
static RT_EASE_IN_OUT: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.7, &EASE_IN_OUT));
static RT_SPRING: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(3.0, &SPRING_SOFT));
static RT_FAST: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.3, &Easing::EaseOut));

/// Cassette face sizes in mm; the outer cut contour adds a folded return on
/// every side (`RET_MM`).
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
                <text x="1766" y="66" text-anchor="end" font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} letter-spacing="2">"PERIGRAM / FACADE PACK"</text>
            </svg>
        )
    }
}

// ---- shared helpers ----

/// Geometric estimate for dynamic mono text (JetBrains Mono advance ≈ 0.6 em).
fn mono_est(text: &str, size: usize) -> f32 {
    text.len() as f32 * size as f32 * 0.60
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

fn mono_width<'a>(frame: &mut Frame, ctx: &FFramesContext<'a, '_>, text: &'a str, size: usize, weight: u16) -> f32 {
    frame
        .text_width(ctx, FontQuery { family: MONO, size, weight, ..Default::default() }, text)
        .map(|w| w as f32)
        .unwrap_or(text.len() as f32 * size as f32 * 0.62)
}

fn fit_size<'a>(frame: &mut Frame, ctx: &FFramesContext<'a, '_>, text: &'a str, preferred: usize, max_width: usize) -> usize {
    let mut size = preferred;
    loop {
        let font = FontQuery { family: DISPLAY, size, weight: W_MED, ..Default::default() };
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
            <rect x="154" y="112" width="56" height="56" rx="10" fill={CUT} />
            <text x="182" y="149" text-anchor="middle" font-size="28" font-weight={W_BOLD} fill={BG}>{num}</text>
            <text x="238" y="149" font-size="28" font-weight={W_REG} fill={INK} letter-spacing="4">{title}</text>
        </g>
    )
}

fn caption<'a>(text: &'a str, t: f32, frame: &Frame) -> Svgr<'a> {
    let o = ramp(frame, t);
    fframes::svgr!(
        <g opacity={o}>
            <rect x="154" y="944" width="46" height="6" rx="3" fill={CUT} />
            <text x="218" y="958" font-family={DISPLAY} font-size="40" font-weight={W_MED} fill={INK}>{text}</text>
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

/// Horizontal dimension line with end ticks and a centered label.
fn dim_h<'a>(x1: f32, x2: f32, y: f32, label: &str, size: f32) -> Svgr<'a> {
    fframes::svgr!(
        <g stroke={DIM} stroke-width="1.5">
            <path d={format!("M{x1} {y} H{x2}")} />
            <path d={format!("M{x1} {} V{}", y - 7.0, y + 7.0)} />
            <path d={format!("M{x2} {} V{}", y - 7.0, y + 7.0)} />
            <text x={(x1 + x2) / 2.0} y={y - 12.0} text-anchor="middle" font-family={MONO} font-size={size} font-weight={W_REG} fill={DIM} stroke="none">{label.to_string()}</text>
        </g>
    )
}

/// Vertical dimension line; the label sits right of the line, horizontal.
fn dim_v<'a>(y1: f32, y2: f32, x: f32, label: &str, size: f32) -> Svgr<'a> {
    fframes::svgr!(
        <g stroke={DIM} stroke-width="1.5">
            <path d={format!("M{x} {y1} V{y2}")} />
            <path d={format!("M{} {y1} H{}", x - 7.0, x + 7.0)} />
            <path d={format!("M{} {y2} H{}", x - 7.0, x + 7.0)} />
            <text x={x + 14.0} y={(y1 + y2) / 2.0 + 8.0} font-family={MONO} font-size={size} font-weight={W_REG} fill={DIM} stroke="none">{label.to_string()}</text>
        </g>
    )
}

struct PatternOpts {
    ret_mm: f32,
    scale: f32,
    cut_w: f32,
    holes: bool,
    mark: Option<(&'static str, f32)>,
}

/// Cassette flat pattern centered on (0, 0): outer cut contour, face, dashed
/// fold routes, corner holes and the production mark on the root face.
fn flat_pattern<'a>(face_w: f32, face_h: f32, o: &PatternOpts) -> Svgr<'a> {
    let s = o.scale;
    let r = o.ret_mm * s;
    let (fw, fh) = (face_w * s, face_h * s);
    let (ow, oh) = (fw + 2.0 * r, fh + 2.0 * r);
    let holes: Vec<Svgr> = if o.holes {
        [(-fw / 2.0, -fh / 2.0), (fw / 2.0, -fh / 2.0), (fw / 2.0, fh / 2.0), (-fw / 2.0, fh / 2.0)]
            .iter()
            .map(|&(hx, hy)| {
                fframes::svgr!(<circle cx={hx} cy={hy} r={(r * 0.22).max(2.2)} fill="none" stroke={CUT} stroke-width={o.cut_w * 0.9} />)
            })
            .collect()
    } else {
        vec![]
    };
    let dash = (r * 0.35).max(4.0);
    let mark = match o.mark {
        Some((text, size)) if fw > size * 6.0 => fframes::svgr!(
            <text x={-fw / 2.0 + 7.0} y={fh / 2.0 - 8.0} font-family={MONO} font-size={size} font-weight={W_REG} fill={MARK}>{text}</text>
        ),
        _ => Svgr::empty(),
    };
    fframes::svgr!(
        <g>
            <rect x={-ow / 2.0} y={-oh / 2.0} width={ow} height={oh} fill={PANEL} stroke={CUT} stroke-width={o.cut_w} />
            <rect x={-fw / 2.0} y={-fh / 2.0} width={fw} height={fh} fill={PANEL_2} />
            <rect x={-fw / 2.0} y={-fh / 2.0} width={fw} height={fh} fill="none" stroke={FOLD} stroke-width={o.cut_w * 0.8} stroke-dasharray={dash} />
            {holes}
            {mark}
        </g>
    )
}

/// Point on a w x h rectangle perimeter, starting at the top-left corner,
/// clockwise; matches the `M -w/2 -h/2 H w/2 V h/2 H -w/2 Z` contour path.
fn perimeter_point(w: f32, h: f32, p: f32) -> (f32, f32) {
    let (hw, hh) = (w / 2.0, h / 2.0);
    let s = p.clamp(0.0, 1.0) * 2.0 * (w + h);
    if s <= w {
        (-hw + s, -hh)
    } else if s <= w + h {
        (hw, -hh + (s - w))
    } else if s <= 2.0 * w + h {
        (hw - (s - w - h), hh)
    } else {
        (-hw, hh - (s - 2.0 * w - h))
    }
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

        // Facade elevation assembling from cassette panels.
        let (cols, rows, pw, ph, gap) = (6, 5, 128.0, 92.0, 10.0);
        let (ox, oy) = (940.0, 250.0);
        let panels: Vec<Svgr> = (0..rows * cols)
            .map(|i| {
                let (c, r) = (i % cols, i / cols);
                let start = 0.25 + (c + r) as f32 * 0.08;
                let p = ramp(&frame, start);
                let x = ox + c as f32 * (pw + gap);
                let y = oy + r as f32 * (ph + gap);
                let folded = (c * 2 + r) % 3 == 0;
                let inner = if folded {
                    fframes::svgr!(<rect x={x + 16.0} y={y + 13.0} width={pw - 32.0} height={ph - 26.0} fill="none" stroke={FOLD} stroke-width="1.5" stroke-dasharray="8" opacity="0.8" />)
                } else {
                    Svgr::empty()
                };
                fframes::svgr!(
                    <g opacity={p}>
                        <rect x={x} y={y} width={pw} height={ph} rx="4" fill={PANEL} stroke={EDGE} />
                        {inner}
                    </g>
                )
            })
            .collect();

        let size = fit_size(&mut frame, ctx, self.title, 148, 740);
        let (first, second) = match self.title.find("Facade") {
            Some(idx) => (&self.title[..idx], Some(&self.title[idx..])),
            None => (self.title, None),
        };
        let w1 = frame
            .text_width(ctx, FontQuery { family: DISPLAY, size, weight: W_MED, ..Default::default() }, first)
            .map(|w| w as f32)
            .unwrap_or(size as f32 * first.len() as f32 * 0.55);
        let second_text = match second {
            Some(s) => fframes::svgr!(<text x={154.0 + w1 - size as f32 * 0.04} y="500" font-family={DISPLAY} font-size={size} font-weight={W_MED} fill={CUT} letter-spacing="-4">{s}</text>),
            None => Svgr::empty(),
        };
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
            <g opacity={o}>
                {panels}
                <g transform={Transform::translate(0.0, rise(&frame, 0.0, 64.0))}>
                    <text x="154" y="500" font-family={DISPLAY} font-size={size} font-weight={W_MED} fill={INK} letter-spacing="-4">{first}</text>
                    {second_text}
                </g>
                <path d="M154 560 H1620" stroke={GRID} stroke-width="2" />
                <rect x="154" y="559" width={line} height="3" fill={CUT} />
                <text x="154" y="634" font-family={MONO} font-size="28" font-weight={W_REG} fill={MUTED} letter-spacing="1" opacity={ramp(&frame, 0.7)}>{sub}</text>
                <text x="154" y="706" font-family={MONO} font-size="24" font-weight={W_REG} fill={DIM} letter-spacing="2" opacity={ramp(&frame, 1.0)}>"OCCS TEMPLATES / NESTING / DXF"</text>
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

        // The drawing, centered left.
        let (cx, cy, s) = (620.0, 580.0, 0.62);
        let (fw, fh, rp) = (a * s, b * s, r * s);
        let (ow, oh) = (fw + 2.0 * rp, fh + 2.0 * rp);
        let draw_o = ramp(&frame, 0.2);
        let drawing = fframes::svgr!(
            <g transform={Transform::translate(cx, cy)} opacity={draw_o}>
                {flat_pattern(a, b, &PatternOpts { ret_mm: r, scale: s, cut_w: 3.0, holes: true, mark: Some(("FCT-01", 22.0)) })}
                {dim_h(-ow / 2.0, ow / 2.0, oh / 2.0 + 34.0, "A", 30.0)}
                {dim_v(-oh / 2.0, oh / 2.0, ow / 2.0 + 34.0, "B", 30.0)}
                {dim_h(fw / 2.0, ow / 2.0, -oh / 2.0 - 16.0, "R", 22.0)}
            </g>
        );

        // Parameter panel.
        let rows: Vec<Svgr> = [("A", "width", a, 180.0, 300.0, 0.4, 1.6), ("B", "height", b, 360.0, 600.0, 2.0, 3.4), ("R", "return", r, 20.0, 40.0, 3.8, 4.8)]
            .iter()
            .enumerate()
            .map(|(i, &(name, label, val, min, max, t0, t1))| {
                let y = 452.0 + i as f32 * 132.0;
                let ro = ramp(&frame, 0.6 + i as f32 * 0.12);
                let changing = t >= t0 - 0.05 && t <= t1 + 0.2;
                let norm = ((val - min) / (max - min) * 452.0).max(0.5);
                let color = if changing { CUT } else { INK };
                fframes::svgr!(
                    <g opacity={ro} transform={Transform::translate(0.0, rise(&frame, 0.6 + i as f32 * 0.12, 26.0))}>
                        <text x="1282" y={y} font-family={DISPLAY} font-size="34" font-weight={W_MED} fill={INK}>{format!("{name} · {label}")}</text>
                        <text x="1734" y={y + 4.0} text-anchor="end" font-family={MONO} font-size="52" font-weight={W_BOLD} fill={color}>{format!("{val:.0}")}</text>
                        <rect x="1282" y={y + 22.0} width="452" height="4" rx="2" fill={GRID} />
                        <rect x="1282" y={y + 22.0} width={norm} height="4" rx="2" fill={color} />
                    </g>
                )
            })
            .collect();
        let panel_o = ramp(&frame, 0.35);
        let panel = fframes::svgr!(
            <g opacity={panel_o} transform={Transform::translate(0.0, rise(&frame, 0.35, 40.0))}>
                <rect x="1250" y="310" width="516" height="500" rx="20" fill={PANEL} stroke={EDGE} />
                <text x="1282" y="376" font-family={MONO} font-size="26" font-weight={W_REG} fill={MUTED} letter-spacing="6">"PARAMETERS"</text>
                {rows}
            </g>
        );

        // Layer legend.
        let mut legend: Vec<Svgr> = vec![];
        {
            let mut lx = 154.0f32;
            for (idx, &(name, color)) in [("cut.outer", CUT), ("fold.route", FOLD), ("cut.hole", CUT), ("code.cassette_mark", MARK)].iter().enumerate() {
                let w = mono_width(&mut frame, ctx, name, 24, W_REG);
                let swatch = if name == "cut.hole" {
                    fframes::svgr!(<circle cx={lx + 8.0} cy="878" r="6" fill="none" stroke={color} stroke-width="2.5" />)
                } else if name == "code.cassette_mark" {
                    fframes::svgr!(<text x={lx} y="886" font-family={MONO} font-size="24" font-weight={W_BOLD} fill={color}>"M"</text>)
                } else if name == "fold.route" {
                    fframes::svgr!(<path d={format!("M{lx} 878 H{}", lx + 34.0)} stroke={color} stroke-width="2.5" stroke-dasharray="7" />)
                } else {
                    fframes::svgr!(<path d={format!("M{lx} 878 H{}", lx + 34.0)} stroke={color} stroke-width="2.5" />)
                };
                legend.push(fframes::svgr!(
                    <g opacity={ramp(&frame, 5.2 + idx as f32 * 0.12)}>
                        {swatch}
                        <text x={lx + 46.0} y="886" font-family={MONO} font-size="24" font-weight={W_REG} fill={DIM}>{name}</text>
                    </g>
                ));
                lx += 46.0 + w + 44.0;
            }
        }

        fframes::svgr!(
            <g opacity={o}>
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

        // Template card.
        let tmpl_o = ramp(&frame, 0.2);
        let tmpl = fframes::svgr!(
            <g opacity={tmpl_o} transform={Transform::translate(0.0, rise(&frame, 0.2, 40.0))}>
                <rect x="190" y="330" width="320" height="440" rx="16" fill={PANEL} stroke={EDGE} />
                <rect x="190" y="330" width="320" height="60" rx="16" fill={PANEL_2} />
                <text x="214" y="368" font-family={MONO} font-size="22" font-weight={W_BOLD} fill={INK}>"FCT-01 · TEMPLATE"</text>
                <g transform={Transform::translate(350.0, 590.0)}>
                    {flat_pattern(PIECES[0].w, PIECES[0].h, &PatternOpts { ret_mm: RET_MM, scale: 0.28, cut_w: 2.0, holes: false, mark: None })}
                    {dim_h(-53.0, 53.0, 116.0, "A", 20.0)}
                    {dim_v(-102.0, 102.0, 78.0, "B", 20.0)}
                </g>
                <text x="350" y="738" text-anchor="middle" font-family={MONO} font-size="20" font-weight={W_REG} fill={MUTED}>".occs graph"</text>
            </g>
        );

        // Baked cassette-design cards.
        let scales = [0.28, 0.24, 0.27];
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
                let (ow, oh) = outer_mm(spec, RET_MM);
                fframes::svgr!(
                    <g opacity={co} transform={format!("translate({x} {ry}) scale({scale})")}>
                        <rect x="0" y="330" width="340" height="440" rx="16" fill={PANEL} stroke={EDGE} />
                        <rect x="0" y="330" width="340" height="60" rx="16" fill={PANEL_2} />
                        <circle cx="312" cy="360" r="7" fill="#7BD88F" />
                        <text x="24" y="368" font-family={MONO} font-size="22" font-weight={W_BOLD} fill={INK}>{spec.id}</text>
                        <g transform={Transform::translate(170.0, 580.0)}>
                            {flat_pattern(spec.w, spec.h, &PatternOpts { ret_mm: RET_MM, scale: scales[i], cut_w: 2.0, holes: true, mark: Some((spec.id, 18.0)) })}
                        </g>
                        {dim_h(170.0 - ow * scales[i] / 2.0, 170.0 + ow * scales[i] / 2.0, 580.0 + oh * scales[i] / 2.0 + 30.0, &format!("{} × {}", spec.w as usize, spec.h as usize), 22.0)}
                        <text x="170" y="738" text-anchor="middle" font-family={MONO} font-size="20" font-weight={W_REG} fill={MUTED}>"baked · fixed"</text>
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
                let y = 470.0 - 60.0 * (std::f32::consts::PI * p).sin();
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
            <g opacity={o}>
                {scene_label("02", "BAKE PRODUCTION PIECES", 0.1, &frame)}
                {tmpl}
                {cards}
                {pills}
                <g opacity={ramp(&frame, 0.6)}>
                    {chip(ev_text, ev_w, 190.0, 806.0, MUTED)}
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
                <rect x={sx} y={sy} width={sh_w} height={sh_h} fill="#0F1A25" stroke={DIM} stroke-width="2" />
            </g>
        );

        // Placed pieces flying in, biggest first.
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
                fframes::svgr!(
                    <g opacity={po} transform={format!("translate({cx} {cy})")}>
                        <g transform={format!("rotate({rot})")}>
                            {flat_pattern(spec.w, spec.h, &PatternOpts { ret_mm: RET_MM, scale: s, cut_w: 1.8, holes: true, mark: None })}
                        </g>
                        <text x={-bw * s / 2.0 + 6.0} y={bh * s / 2.0 - 7.0} font-family={MONO} font-size="17" font-weight={W_REG} fill={MARK} opacity={mark_o}>{spec.id}</text>
                    </g>
                )
            })
            .collect();

        // Stats column.
        let eff = EFFICIENCY * frame.animate(&fframes::timeline!(
            at 5.0 => 7.0, animate 0.0_f32 => 1.0, EASE_OUT_EXPO,
        ));
        let stats: Vec<Svgr> = [("PIECES", format!("{}", NESTED)), ("SHEETS", "1".to_owned()), ("EFFICIENCY", format!("{eff:.1}%"))]
            .iter()
            .enumerate()
            .map(|(i, (label, value))| {
                let y = 380.0 + i as f32 * 120.0;
                fframes::svgr!(
                    <g opacity={ramp(&frame, 4.4 + i as f32 * 0.15)} transform={Transform::translate(0.0, rise(&frame, 4.4 + i as f32 * 0.15, 24.0))}>
                        <text x="1480" y={y} font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} letter-spacing="3">{*label}</text>
                        <text x="1480" y={y + 62.0} font-family={MONO} font-size="60" font-weight={W_BOLD} fill={INK}>{value.to_string()}</text>
                    </g>
                )
            })
            .collect();

        fframes::svgr!(
            <g opacity={o}>
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

        // The sheet-design record card.
        let (sx, sy, s) = (214.0, 388.0, 0.46);
        let (sh_w, sh_h) = (SHEET_MM.0 * s, SHEET_MM.1 * s);
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
                        {flat_pattern(spec.w, spec.h, &PatternOpts { ret_mm: RET_MM, scale: s, cut_w: 1.4, holes: bw * s > 150.0, mark: None })}
                    </g>
                    <text x={cx - bw * s / 2.0 + 5.0} y={cy + bh * s / 2.0 - 6.0} font-family={MONO} font-size="16" font-weight={W_REG} fill={MARK} opacity={ramp(&frame, 1.0 + i as f32 * 0.14)}>{spec.id}</text>
                )
            })
            .collect();

        // LAYOUT_DXF stamp.
        let stamp_in = frame.animate_runtime(AnimateRuntimeInput { on_second: 4.6, from: 1.7, to: 1.0, animation_runtime: &RT_SPRING });
        let stamp = fframes::svgr!(
            <g transform={format!("translate(1054 730) rotate(-6) scale({stamp_in})")} opacity={ramp(&frame, 4.6)}>
                <rect x="-190" y="-46" width="380" height="92" rx="12" fill={CUT} opacity="0.14" />
                <rect x="-190" y="-46" width="380" height="92" rx="12" fill="none" stroke={CUT} stroke-width="4" />
                <text x="0" y="14" text-anchor="middle" font-family={MONO} font-size="40" font-weight={W_BOLD} fill={CUT} letter-spacing="2">"LAYOUT_DXF"</text>
            </g>
        );
        let dxf_out = frame.animate_runtime(AnimateRuntimeInput { on_second: 5.4, from: 0.0, to: 1.0, animation_runtime: &RT_EASE_IN_OUT });
        let dxf_x = 1230.0 + (1460.0 - 1230.0) * dxf_out;
        let dxf_y = 700.0 - 260.0 * dxf_out;
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
            <g opacity={o}>
                {scene_label("04", "SHEET DESIGN & DXF", 0.1, &frame)}
                <g opacity={card_o} transform={Transform::translate(0.0, rise(&frame, 0.2, 40.0))}>
                    <rect x="154" y="278" width="1250" height="640" rx="16" fill={PANEL} stroke={EDGE} />
                    <rect x="154" y="278" width="1250" height="64" rx="16" fill={PANEL_2} />
                    <text x="186" y="320" font-family={MONO} font-size="26" font-weight={W_BOLD} fill={INK}>"SHEET-01"</text>
                    <text x="1372" y="318" text-anchor="end" font-family={MONO} font-size="22" font-weight={W_REG} fill={MUTED}>"geometry rev · 4"</text>
                    <rect x={sx} y={sy} width={sh_w} height={sh_h} fill="#0F1A25" stroke={DIM} stroke-width="2" />
                    {pieces}
                    <text x="186" y="878" font-family={MONO} font-size="20" font-weight={W_REG} fill={DIM} opacity={ramp(&frame, 3.4)}>"entity_revision · scope: geometry"</text>
                </g>
                <rect x="1480" y="330" width="286" height="416" rx="16" fill={PANEL} stroke={EDGE} opacity={ramp(&frame, 1.2)} />
                {rows}
                {stamp}
                <g opacity={dxf_o} transform={Transform::translate(dxf_x, dxf_y)}>
                    {chip("sheet-01.dxf", 130.0, 0.0, 0.0, CUT)}
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
        Duration::Seconds(9.3)
    }

    fn overlap(&self) -> Overlap {
        Overlap::Previous(0.35)
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let o = scene_in(t) * (1.0 - ((t - 8.6) / 0.7).clamp(0.0, 1.0));

        // Phase A: the laser walks one cut.outer contour and frees the piece.
        let (cx, cy, s) = (560.0, 560.0, 0.85);
        let spec = &PIECES[0];
        let (ow, oh) = outer_mm(spec, RET_MM);
        let (w, h) = (ow * s, oh * s);
        let per = 2.0 * (w + h);
        let p = frame.animate(&fframes::timeline!(
            at 0.8 => 2.8, animate 0.0_f32 => 1.0, EASE_IN_OUT,
        ));
        let (dx, dy) = (w / 2.0, h / 2.0);
        let contour = format!("M{} {} H{} V{} H{} Z", -dx, -dy, dx, dy, -dx);
        let (px, py) = perimeter_point(w, h, p);
        let freed = frame.animate(&fframes::timeline!(
            at 2.9 => 3.5, animate 0.0_f32 => 1.0, EASE_OUT_EXPO,
        ));
        let fx = 24.0 * freed;
        let fy = -24.0 * freed;
        let cut_a = fframes::svgr!(
            <g opacity={1.0 - ramp(&frame, 3.5)}>
                <text x={cx - w / 2.0} y={cy - h / 2.0 - 28.0} font-family={MONO} font-size="24" font-weight={W_REG} fill={MUTED} opacity={ramp(&frame, 0.4)}>"cut.outer"</text>
                <g transform={Transform::translate(cx, cy)}>
                    <g transform={format!("translate({fx} {fy})")}>
                        <path d={contour.clone()} fill="#000000" opacity={0.35 * freed} transform={Transform::translate(16.0, 18.0)} />
                        {flat_pattern(spec.w, spec.h, &PatternOpts { ret_mm: RET_MM, scale: s, cut_w: 4.0, holes: true, mark: Some((spec.id, 24.0)) })}
                        <path d={contour} fill="none" stroke={CUT} stroke-width="4" stroke-dasharray={per} stroke-dashoffset={per * (1.0 - p)} />
                    </g>
                    <g transform={format!("translate({} {})", px + fx, py + fy)} opacity={(1.0 - freed).max(0.15)}>
                        <circle r="26" fill={CUT} opacity="0.25" />
                        <circle r="9" fill={CUT} />
                        <circle r="3" fill={INK} />
                    </g>
                </g>
            </g>
        );

        // Phase B: lifecycle recap.
        let line = (1400.0 * frame.animate(&fframes::timeline!(
            at 3.9 => 4.6, animate 0.0_f32 => 1.0, EASE_IN_OUT,
        )))
        .max(0.5);
        let icons: [Svgr; 5] = [recap_icon_template(), recap_icon_bake(), recap_icon_nest(), recap_icon_sheet(), recap_icon_cut()];
        let labels = ["TEMPLATE", "BAKE", "NEST", "SHEET", "CUT"];
        let nodes: Vec<Svgr> = icons
            .into_iter()
            .enumerate()
            .map(|(i, icon)| {
                let x = 260.0 + i as f32 * 350.0;
                let t0 = 4.1 + i as f32 * 0.12;
                let scale = 1.0 - 0.12 * (1.0 - frame.animate_runtime(AnimateRuntimeInput { on_second: t0, from: 0.0, to: 1.0, animation_runtime: &RT_SPRING }));
                fframes::svgr!(
                    <g opacity={ramp(&frame, t0)}>
                        <circle cx={x} cy="430" r="9" fill={CUT} />
                        <g transform={format!("translate({x} 330) scale({scale})")}>{icon}</g>
                        <text x={x} y="492" text-anchor="middle" font-family={MONO} font-size="26" font-weight={W_BOLD} fill={INK} letter-spacing="3">{labels[i]}</text>
                    </g>
                )
            })
            .collect();

        let end_size = 88;
        let w1 = frame
            .text_width(ctx, FontQuery { family: DISPLAY, size: end_size, weight: W_MED, ..Default::default() }, "Perigram")
            .map(|w| w as f32)
            .unwrap_or(360.0);
        let recap = fframes::svgr!(
            <g>
                <path d="M260 430 H1660" stroke={GRID} stroke-width="2" />
                <path d="M260 430 H1660" stroke={DIM} stroke-width="2" stroke-dasharray={line} stroke-dashoffset={(1400.0 - line).max(0.0)} />
                {nodes}
            </g>
        );
        let end = fframes::svgr!(
            <g opacity={ramp(&frame, 6.6)} transform={Transform::translate(0.0, rise(&frame, 6.6, 30.0))}>
                <text x="154" y="700" font-family={DISPLAY} font-size={end_size} font-weight={W_MED} fill={INK} letter-spacing="-3">"Perigram"</text>
                <text x={154.0 + w1 - (end_size as f32) * 0.04} y="700" font-family={DISPLAY} font-size={end_size} font-weight={W_MED} fill={CUT} letter-spacing="-3">"Facade"</text>
                <text x="154" y="762" font-family={MONO} font-size="28" font-weight={W_REG} fill={MUTED} letter-spacing="1">"PARAMETRIC CASSETTES — DESIGN TO PRODUCTION"</text>
            </g>
        );

        fframes::svgr!(
            <g opacity={o}>
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
            <rect x="-34" y="-46" width="68" height="92" fill={PANEL} stroke={CUT} stroke-width="2.5" />
            <rect x="-22" y="-34" width="44" height="68" fill="none" stroke={FOLD} stroke-width="1.5" stroke-dasharray="6" />
            <path d="M-34 62 H34" stroke={DIM} stroke-width="1.5" />
            <text x="0" y="84" text-anchor="middle" font-family={MONO} font-size="24" font-weight={W_REG} fill={DIM}>"A"</text>
        </g>
    )
}

fn recap_icon_bake() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <rect x="-42" y="-50" width="84" height="100" rx="8" fill={PANEL} stroke={EDGE} />
            <rect x="-42" y="-50" width="84" height="22" rx="8" fill={PANEL_2} />
            <rect x="-24" y="-14" width="48" height="48" fill={PANEL_2} stroke={CUT} stroke-width="2" />
            <text x="0" y="66" text-anchor="middle" font-family={MONO} font-size="22" font-weight={W_REG} fill={DIM}>"600"</text>
        </g>
    )
}

fn recap_icon_nest() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <rect x="-54" y="-34" width="108" height="68" fill="#0F1A25" stroke={DIM} stroke-width="2" />
            <rect x="-48" y="-28" width="30" height="26" fill={PANEL} stroke={CUT} stroke-width="1.5" />
            <rect x="-12" y="-28" width="30" height="26" fill={PANEL} stroke={CUT} stroke-width="1.5" />
            <rect x="-48" y="2" width="30" height="26" fill={PANEL} stroke={CUT} stroke-width="1.5" />
            <rect x="24" y="-28" width="24" height="56" fill={PANEL} stroke={CUT} stroke-width="1.5" transform="rotate(90 36 0)" />
        </g>
    )
}

fn recap_icon_sheet() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <rect x="-54" y="-34" width="108" height="68" fill="#0F1A25" stroke={DIM} stroke-width="2" />
            <rect x="-48" y="-28" width="44" height="28" fill={PANEL} stroke={CUT} stroke-width="1.5" />
            <rect x="4" y="-28" width="44" height="28" fill={PANEL} stroke={CUT} stroke-width="1.5" />
            <rect x="-30" y="14" width="60" height="26" rx="6" fill="none" stroke={MARK} stroke-width="2" />
            <text x="0" y="33" text-anchor="middle" font-family={MONO} font-size="18" font-weight={W_BOLD} fill={MARK}>"DXF"</text>
        </g>
    )
}

fn recap_icon_cut() -> Svgr<'static> {
    fframes::svgr!(
        <g>
            <rect x="-32" y="-44" width="64" height="88" fill={PANEL} stroke={CUT} stroke-width="2.5" stroke-dasharray="230" stroke-dashoffset="46" />
            <circle cx="-32" cy="-44" r="10" fill={CUT} opacity="0.25" />
            <circle cx="-32" cy="-44" r="5" fill={CUT} />
        </g>
    )
}
