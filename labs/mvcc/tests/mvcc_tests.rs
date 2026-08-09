//! The browser and these tests run the same five checks (see src/lib.rs).

use mvcc as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(no_dirty_reads, lab::check_no_dirty_reads());
lab_test!(snapshot_repeatable, lab::check_snapshot_repeatable());
lab_test!(ww_conflict, lab::check_ww_conflict());
lab_test!(read_own_writes, lab::check_read_own_writes());
lab_test!(interleaving_storm, lab::check_interleaving_storm());
