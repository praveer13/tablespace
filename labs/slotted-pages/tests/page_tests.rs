//! The browser and these tests run the same five checks (see src/lib.rs).

use slotted_pages as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(insert_read, lab::check_insert_read());
lab_test!(no_overlap, lab::check_no_overlap());
lab_test!(freespace_accounting, lab::check_freespace_accounting());
lab_test!(delete_reuse, lab::check_delete_reuse());
lab_test!(storm, lab::check_storm());
