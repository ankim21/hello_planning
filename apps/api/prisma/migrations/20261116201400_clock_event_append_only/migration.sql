-- Clock events are the legal record of what employees clocked.
-- The database itself refuses to change or delete them, whatever the
-- application code does.
CREATE FUNCTION forbid_clock_event_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ClockEvent is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clock_event_append_only
  BEFORE UPDATE OR DELETE ON "ClockEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_clock_event_change();
