create extension if not exists pg_cron;

do $ops$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'pg_cron is installed, but cron.schedule(text,text,text) is not available on this database';
  end if;

  begin
    perform cron.unschedule('cv-intel-prune-ops-telemetry');
  exception
    when others then
      null;
  end;

  perform cron.schedule(
    'cv-intel-prune-ops-telemetry',
    '23 2 * * 0',
    'select public.prune_ops_telemetry_v1(interval ''7 days'');'
  );
end;
$ops$;
