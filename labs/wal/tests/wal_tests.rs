//! The browser and these tests run the same five checks (see src/lib.rs).

use wal as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(log_first, lab::check_log_first());
lab_test!(checksum_corruption, lab::check_checksum_corruption());
lab_test!(replay_idempotent, lab::check_replay_idempotent());
lab_test!(committed_durable, lab::check_committed_durable());
lab_test!(crash_storm, lab::check_crash_storm());
