ALTER TABLE groups ADD COLUMN starting_points INTEGER NOT NULL DEFAULT 35000 CHECK(starting_points > 0);
ALTER TABLE groups ADD COLUMN return_points INTEGER NOT NULL DEFAULT 40000 CHECK(return_points > 0);
ALTER TABLE groups ADD COLUMN chip_rate INTEGER NOT NULL DEFAULT 5 CHECK(chip_rate >= 0);

ALTER TABLE sessions ADD COLUMN starting_points INTEGER NOT NULL DEFAULT 35000 CHECK(starting_points > 0);
ALTER TABLE sessions ADD COLUMN return_points INTEGER NOT NULL DEFAULT 40000 CHECK(return_points > 0);
ALTER TABLE sessions ADD COLUMN chip_rate INTEGER NOT NULL DEFAULT 5 CHECK(chip_rate >= 0);
