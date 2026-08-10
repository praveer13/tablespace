//! The browser and these tests run the same five checks (see src/lib.rs).

use columnar as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(encode_roundtrip, lab::check_encode_roundtrip());
lab_test!(zone_skip, lab::check_zone_skip());
lab_test!(vectorized_ops, lab::check_vectorized_ops());
lab_test!(compression_band, lab::check_compression_band());
lab_test!(storm, lab::check_storm());
