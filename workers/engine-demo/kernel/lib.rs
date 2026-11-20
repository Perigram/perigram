// Torus tessellation kernel: writes vertex positions and normals into
// linear memory for the host to read.
#[no_mangle]
pub extern "C" fn tessellate(buffer: *mut f64, major: i32, minor: i32, ring: f64, tube: f64) {
    let major = major.max(3) as usize;
    let minor = minor.max(3) as usize;
    let count = major * minor;
    for i in 0..major {
        let theta = (i as f64) * (std::f64::consts::TAU / major as f64);
        let (sin_t, cos_t) = theta.sin_cos();
        for j in 0..minor {
            let phi = (j as f64) * (std::f64::consts::TAU / minor as f64);
            let (sin_p, cos_p) = phi.sin_cos();
            let vertex = i * minor + j;
            unsafe {
                *buffer.add(vertex * 3) = (ring + tube * cos_p) * cos_t;
                *buffer.add(vertex * 3 + 1) = (ring + tube * cos_p) * sin_t;
                *buffer.add(vertex * 3 + 2) = tube * sin_p;
                let normal = buffer.add(count * 3);
                *normal.add(vertex * 3) = cos_p * cos_t;
                *normal.add(vertex * 3 + 1) = cos_p * sin_t;
                *normal.add(vertex * 3 + 2) = sin_p;
            }
        }
    }
}
