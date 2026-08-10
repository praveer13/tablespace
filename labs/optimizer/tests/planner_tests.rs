//! The browser and these tests run the same five checks (see src/lib.rs).

use optimizer as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(cost_model, lab::check_cost_model());
lab_test!(left_deep_dp, lab::check_left_deep_dp());
lab_test!(interesting_orders, lab::check_interesting_orders());
lab_test!(beats_naive, lab::check_beats_naive());
lab_test!(storm, lab::check_storm());
