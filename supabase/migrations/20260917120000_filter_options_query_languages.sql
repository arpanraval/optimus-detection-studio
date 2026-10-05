-- Add query_languages to get_filter_options.
--
-- Every other group in the library filter panel derives its options from the data; Query
-- Language was the one hardcoded list, so values written by importers or older clients
-- ('Splunk (SPL)', 'crowdstrike', lowercase 'yara') had no option at all and their rules could
-- not be found, while the panel offered nine options that matched nothing.
--
-- Read-only and STABLE; replacing it back restores the previous behaviour.

CREATE OR REPLACE FUNCTION public.get_filter_options(p_library_type text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT json_build_object(
    'technologies',
      COALESCE((
        SELECT array_agg(DISTINCT technology ORDER BY technology)
        FROM detections
        WHERE library_type = p_library_type
          AND technology IS NOT NULL AND technology != ''
      ), '{}'),

    'log_sources',
      COALESCE((
        SELECT array_agg(DISTINCT "logSource" ORDER BY "logSource")
        FROM detections
        WHERE library_type = p_library_type
          AND "logSource" IS NOT NULL AND "logSource" != ''
      ), '{}'),

    'authors',
      COALESCE((
        SELECT array_agg(DISTINCT author ORDER BY author)
        FROM detections
        WHERE library_type = p_library_type
          AND author IS NOT NULL AND author != ''
      ), '{}'),

    'platforms',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(platforms) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'tags',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(tags) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'mitre_tactics',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("mitreTactics") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'mitre_techniques',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("mitreTechniques") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'threat_actors',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("threatActors") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'campaigns',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(campaigns) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'software',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(software) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'cves',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("associatedCVEs") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    -- Query languages actually present in this library. The filter panel unions these with the
    -- curated QUERY_LANGUAGES list so a value written by an importer or an older client is
    -- still findable, instead of the panel offering options that match nothing while the real
    -- rules are unreachable.
    'query_languages',
      COALESCE((
        SELECT array_agg(DISTINCT "queryLanguage" ORDER BY "queryLanguage")
        FROM detections
        WHERE library_type = p_library_type
          AND "queryLanguage" IS NOT NULL AND "queryLanguage" != ''
      ), '{}')
  );
$function$;
