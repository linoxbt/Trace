-- Jobs beyond home repair: each job has a type, which sets the words the app
-- uses for its two sides and the lines its scope starts from.
alter table jobs add column category text not null default 'home_repair'
  check (category in ('home_repair','cleaning','car','garden','moving','install','events'));
