#[derive(Default)]
pub struct Counter(pub u32);

impl Counter {
    pub fn increment(&mut self) {
        self.0 += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::Counter;

    #[test]
    fn new_counter_is_zero() {
        // AC-2
        assert_eq!(Counter::default().0, 0);
    }
}
