-- Runs once, when the Docker volume is first created. make test-api and make test-e2e
-- drop and recreate this database on every run (DATABASE_URL_TEST).
CREATE DATABASE moonx_test;
