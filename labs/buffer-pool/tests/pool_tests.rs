//! The browser and these tests run the same five checks (see src/lib.rs).

use buffer_pool as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(fetch_pin, lab::check_fetch_pin());
lab_test!(evict_order, lab::check_evict_order());
lab_test!(dirty_writeback, lab::check_dirty_writeback());
lab_test!(scan_resistance, lab::check_scan_resistance());
lab_test!(storm, lab::check_storm());
