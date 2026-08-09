//! The browser and these tests run the same five checks (see src/lib.rs).

use btree as lab;

macro_rules! lab_test {
    ($name:ident, $check:expr) => {
        #[test]
        fn $name() {
            let c = $check;
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

lab_test!(lookup_correct, lab::check_lookup_correct());
lab_test!(ordered_scans, lab::check_ordered_scans());
lab_test!(split_balance, lab::check_split_balance());
lab_test!(adversarial_orders, lab::check_adversarial_orders());
lab_test!(storm, lab::check_storm());
