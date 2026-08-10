//! The browser and these tests run the same five checks (see src/lib.rs).

use volcano as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(scan_project, lab::check_scan_project());
lab_test!(select_filter, lab::check_select_filter());
lab_test!(join_correct, lab::check_join_correct());
lab_test!(aggregate_correct, lab::check_aggregate_correct());
lab_test!(query_suite, lab::check_query_suite());
