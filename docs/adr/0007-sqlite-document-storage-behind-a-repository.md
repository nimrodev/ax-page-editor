# SQLite document storage behind a repository interface

Configurations are stored as one JSON document per normalized URL, in SQLite, behind a
repository interface.

## Considered options

The configuration is always read and written whole — there is no query into its internals — so
document-shaped storage is correct rather than lazy, and normalising modifications into tables
would buy query flexibility nothing uses. Postgres with JSONB is the right production answer
once there are tenants and concurrent editors, and MongoDB fits the data shape naturally; both
were rejected here because they require a running server, and setup friction is a real cost
when the reader of this repository has to get it running. Plain JSON files were rejected for
lacking atomic writes.

## Consequences

The repository interface is what makes the eventual move to Postgres a single-file change
rather than a claim in a README. At production scale the agent read path would not hit the
database at all: compiled configurations belong in an edge key-value store, with page-change
invalidation.
