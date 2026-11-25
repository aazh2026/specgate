# language: en
# Gherkin example: the same requirements as SPEC.md, written as a feature file.
#
# `specgate` reads both. A scenario with an explicit tag (@AC-1) keeps the
# same id as the markdown criterion, so the two files describe ONE
# requirement, not two.

Feature: Invoice export

  Background:
    Given an account exists

  @AC-1
  Scenario: Export invoices as CSV
    Given an invoice exists
    When the user requests an export
    Then a CSV file is produced

  @AC-2
  Scenario: Export respects the date range filter
    Given invoices exist
    When the user filters by date range
    Then only invoices in range are exported

  Scenario: Export is emailed to the account owner
    Given an account exists
    When the export completes
    Then the file is emailed to the account owner

  Scenario: Export fails loudly when storage is unavailable
    Given the storage backend is unavailable
    When the user requests an export
    Then the failure is reported to the user
