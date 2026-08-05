-- A model that must return exactly one row. The API reads it with no
-- predicate, so a cross join gone wrong would silently return the first of
-- several rows rather than error.

{% test assert_single_row(model) %}

select count(*) as row_count
from {{ model }}
having count(*) != 1

{% endtest %}
