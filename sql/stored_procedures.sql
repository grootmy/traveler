-- 반경 내 장소 검색 저장 프로시저
CREATE OR REPLACE FUNCTION find_places_within_radius(
    p_lat FLOAT, 
    p_lng FLOAT, 
    p_radius INTEGER DEFAULT 1000,
    p_categories TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    textid UUID,
    name TEXT,
    description TEXT,
    category TEXT,
    address TEXT,
    location JSONB,
    image_url TEXT,
    price_level TEXT,
    rating TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    distance FLOAT
) AS $$
DECLARE
    center_point GEOGRAPHY;
BEGIN
    -- WGS84 좌표로 변환하여 중심점 GEOGRAPHY 생성
    center_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;
    
    RETURN QUERY
    SELECT 
        g.textid,
        g.name,
        g.description,
        g.category,
        g.address,
        json_build_object('lat', ST_Y(g.geom::geometry), 'lng', ST_X(g.geom::geometry))::JSONB AS location,
        g.image_url,
        g.price_level,
        g.rating,
        g.created_at,
        g.updated_at,
        ST_Distance(g.geom::geography, center_point) AS distance
    FROM 
        global_places g
    WHERE 
        -- 반경 내에 있는지 확인 (단위: 미터)
        ST_DWithin(g.geom::geography, center_point, p_radius)
        -- 카테고리 필터링 (선택적)
        AND (p_categories IS NULL OR g.category = ANY(p_categories))
    ORDER BY 
        -- 가까운 순서대로 정렬
        distance ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 바운딩 박스 내 장소 검색 저장 프로시저
CREATE OR REPLACE FUNCTION find_places_within_bounds(
    p_sw_lat FLOAT, 
    p_sw_lng FLOAT, 
    p_ne_lat FLOAT, 
    p_ne_lng FLOAT,
    p_categories TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    textid UUID,
    name TEXT,
    description TEXT,
    category TEXT,
    address TEXT,
    location JSONB,
    image_url TEXT,
    price_level TEXT,
    rating TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
DECLARE
    bounds GEOMETRY;
BEGIN
    -- 바운딩 박스 생성
    bounds := ST_MakeEnvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326);
    
    RETURN QUERY
    SELECT 
        g.textid,
        g.name,
        g.description,
        g.category,
        g.address,
        json_build_object('lat', ST_Y(g.geom::geometry), 'lng', ST_X(g.geom::geometry))::JSONB AS location,
        g.image_url,
        g.price_level,
        g.rating,
        g.created_at,
        g.updated_at
    FROM 
        global_places g
    WHERE 
        -- 바운딩 박스 내에 있는지 확인
        ST_Within(g.geom, bounds)
        -- 카테고리 필터링 (선택적)
        AND (p_categories IS NULL OR g.category = ANY(p_categories))
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 주변 장소 카테고리 통계 저장 프로시저
CREATE OR REPLACE FUNCTION get_nearby_place_categories(
    p_lat FLOAT, 
    p_lng FLOAT, 
    p_radius INTEGER DEFAULT 5000
)
RETURNS TABLE (
    category TEXT,
    count BIGINT
) AS $$
DECLARE
    center_point GEOGRAPHY;
BEGIN
    -- WGS84 좌표로 변환하여 중심점 GEOGRAPHY 생성
    center_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;
    
    RETURN QUERY
    SELECT 
        g.category,
        COUNT(*) AS count
    FROM 
        global_places g
    WHERE 
        -- 반경 내에 있는지 확인 (단위: 미터)
        ST_DWithin(g.geom::geography, center_point, p_radius)
    GROUP BY 
        g.category
    ORDER BY 
        count DESC;
END;
$$ LANGUAGE plpgsql; 