-- =============================================
-- ACTUALIZACIÓN: Agregar nombre y cédula directamente en empenos
-- Ejecutar en Supabase SQL Editor
-- =============================================

ALTER TABLE empenos ADD COLUMN IF NOT EXISTS nombre_cliente TEXT DEFAULT '';
ALTER TABLE empenos ADD COLUMN IF NOT EXISTS cedula_cliente TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_empenos_nombre_cliente ON empenos(nombre_cliente);
CREATE INDEX IF NOT EXISTS idx_empenos_cedula_cliente ON empenos(cedula_cliente);

-- Índice trigram para búsqueda fuzzy por nombre directamente en empenos
CREATE INDEX IF NOT EXISTS idx_empenos_nombre_trgm ON empenos USING gin(nombre_cliente gin_trgm_ops);

-- Función de búsqueda fuzzy usando pg_trgm (ya instalado)
CREATE OR REPLACE FUNCTION buscar_empenos_fuzzy(termino TEXT, limite INT DEFAULT 10)
RETURNS TABLE (
  numero INTEGER,
  nombre_cliente TEXT,
  cedula_cliente TEXT,
  tipo_articulo TEXT,
  descripcion TEXT,
  vr_prestado NUMERIC,
  vr_retiro NUMERIC,
  vr_abonado NUMERIC,
  vr_intereses NUMERIC,
  llevar TEXT,
  retiros TEXT,
  espera TEXT,
  aumento TEXT,
  estado TEXT,
  fecha TIMESTAMPTZ,
  operador_id TEXT,
  descuento NUMERIC
) AS $$
BEGIN
  SET pg_trgm.similarity_threshold = 0.15;
  RETURN QUERY
  SELECT e.numero, e.nombre_cliente, e.cedula_cliente, e.tipo_articulo,
         e.descripcion, e.vr_prestado, e.vr_retiro, e.vr_abonado, e.vr_intereses,
         e.llevar, e.retiros, e.espera, e.aumento, e.estado, e.fecha, e.operador_id,
         e.descuento
  FROM empenos e
  WHERE e.estado = 'activo'
  AND (
    e.nombre_cliente % termino
    OR e.nombre_cliente ILIKE '%' || termino || '%'
  )
  ORDER BY similarity(e.nombre_cliente, termino) DESC
  LIMIT limite;
END;
$$ LANGUAGE plpgsql;
