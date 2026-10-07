//! Visual regression: renders a few frames and compares them with the approved PNGs in
//! `_frame_snapshots/`. The first run only creates them, so look at the PNGs before you
//! commit them. `FFRAMES_UPDATE_SNAPSHOTS=1 cargo test` accepts intentional changes; failing
//! frames leave `.actual.png` and `.diff.png` files.
//!
//! The ground-truth test pins the Rust `cut.outer` contour to the evaluator's
//! own output (regenerate with `node video/groundtruth.mjs` from the repo root).
use fframes::{CpuFrameRenderer, Previewer, RenderOptions, StaticMediaProvider, snapshot};
use facade_video::{FacadeVideoMedia, FacadeVideoVideo};

#[test]
fn key_frames_match_snapshots() {
    let media = FacadeVideoMedia::prepare().unwrap();
    let video = FacadeVideoVideo::new(&media, "PerigramFacade");
    let options = RenderOptions {
        media: Some(&media),
        scale_resolution: 0.5,
        ..Default::default()
    };
    let mut previewer = Previewer::new(&video, &options).unwrap();

    snapshot::assert_frames(
        &mut previewer,
        &mut CpuFrameRenderer::default(),
        // Settled frames: the middle of a scene, not the end of it where it fades out.
        &["TitleScene@2s", "AuthorScene@3.7s", "AuthorScene@6.8s", "BakeScene@2.2s", "NestScene@4.2s", "CutScene@5.2s"],
        &snapshot::SnapshotOptions::default(),
    );
}

#[test]
fn no_problems_in_any_frame() {
    // Converting a frame without rasterizing it is fast, so every frame is checked.
    let media = FacadeVideoMedia::prepare().unwrap();
    let video = FacadeVideoVideo::new(&media, "PerigramFacade");
    let options = RenderOptions {
        media: Some(&media),
        ..Default::default()
    };
    let mut previewer = Previewer::new(&video, &options).unwrap();

    let duration = previewer.timeline().duration_in_frames;
    for frame in 0..duration {
        let report = previewer.inspect(frame).unwrap();
        let problems: Vec<_> = report
            .diagnostics
            .iter()
            .filter(|d| d.severity >= fframes::diagnostics::Severity::Warning)
            .map(|d| d.message.as_str())
            .collect();
        assert!(problems.is_empty(), "frame {frame} ({:.2}s): {problems:?}", report.seconds);
    }
}
