//! The browser and these tests run the same five checks (see src/lib.rs).

use hnsw as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(graph_invariants, lab::check_graph_invariants());
lab_test!(recall_band, lab::check_recall_band());
lab_test!(latency_win, lab::check_latency_win());
lab_test!(planner_choice, lab::check_planner_choice());
lab_test!(curve, lab::check_curve());
