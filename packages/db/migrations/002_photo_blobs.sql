-- Photo bytes live in Postgres, beside the rows that point at them. Row-level
-- security is on with no policies, so only the server's own connection can
-- read or write them; the app serves them to a job's two parties only.

create table photo_blobs (
  path text primary key,
  content_type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

alter table photo_blobs enable row level security;
