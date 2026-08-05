{% macro profanity_pattern() %}
    {%- set pattern = env_var('PROFANITY_PATTERN', '') -%}

    {%- if not pattern -%}
        {%- if var('allow_unfiltered_names', false) -%}
            {{ log(
                "WARNING: PROFANITY_PATTERN is unset & allow_unfiltered_names "
                "is on — every artist name will be marked display-safe. Do not "
                "publish this build.", info=True
            ) }}
        {%- else -%}
            {{ exceptions.raise_compiler_error(
                "PROFANITY_PATTERN is not set. dbt reads the process "
                "environment, not .env — export it first:\n"
                "    set -a; source .env; set +a\n"
                "or run with --vars 'allow_unfiltered_names: true' to build "
                "without name filtering."
            ) }}
        {%- endif -%}
    {%- endif -%}

    {{ return(pattern) }}
{% endmacro %}


{% macro is_display_safe(name_column) %}
    {%- set pattern = profanity_pattern() -%}
    {%- if pattern -%}
        not ({{ name_column }} ~* '{{ pattern | replace("'", "''") }}')
    {%- else -%}
        true
    {%- endif -%}
{% endmacro %}



{% macro display_name(name_column) %}
    case when {{ is_display_safe(name_column) }}
         then {{ name_column }}
         else '[redacted]'
    end
{% endmacro %}
