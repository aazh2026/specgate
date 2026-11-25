use rust_counter::Counter;

#[test]
fn increments_counter() {
    // AC-1
    let mut counter = Counter::default();
    counter.increment();
    assert_eq!(counter.0, 1);
}
