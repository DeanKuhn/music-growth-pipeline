select
    sim.artist_id,
    src.artist_name as artist_name,
    src.tier as artist_tier,
    sim.similar_artist_id,
    sim.similar_name,
    tgt.tier as similar_artist_tier,
    sim.similarity_score,
    case when src.tier != tgt.tier then 'cross_tier' else 'same_tier' end as pair_type
from {{ ref('stg_artist_similarities') }} sim
join {{ ref('artist_tiers') }} src on sim.artist_id = src.artist_id
join {{ ref('artist_tiers') }} tgt on sim.similar_artist_id = tgt.artist_id