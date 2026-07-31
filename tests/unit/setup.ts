/**
 * jsdom has no IndexedDB, so the repository tests would otherwise have nothing to run
 * against. fake-indexeddb is a spec-compliant in-memory implementation — including
 * transaction abort semantics, which is precisely what the atomicity tests exercise.
 */
import "fake-indexeddb/auto";
