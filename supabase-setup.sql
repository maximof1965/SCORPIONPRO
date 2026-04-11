-- =============================================
-- SCORPION - Setup completo de base de datos
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. OPERADORES
CREATE TABLE operadores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO operadores (id, nombre) VALUES
  ('1', 'Turno 1'),
  ('2', 'Turno 2'),
  ('3', 'Turno 3');

-- 2. TIPOS DE ARTICULO
CREATE TABLE tipos_articulo (
  codigo TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL
);

INSERT INTO tipos_articulo (codigo, descripcion) VALUES
  ('MOV', 'Celular / Móvil'),
  ('DOC', 'Documento'),
  ('MOT', 'Moto'),
  ('REL', 'Reloj'),
  ('BAF', 'Bafle / Parlante'),
  ('TAB', 'Tablet'),
  ('PAS', 'Pasaporte'),
  ('AUD', 'Audífonos'),
  ('BOL', 'Bolso'),
  ('BICI', 'Bicicleta'),
  ('PC', 'Computador'),
  ('OTRO', 'Otro');

-- 3. CLIENTES
CREATE TABLE clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  documento TEXT,
  telefono TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clientes_documento ON clientes(documento);
CREATE INDEX idx_clientes_nombre ON clientes(nombre);

-- 4. EMPENOS (tabla central)
CREATE TABLE empenos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero INTEGER UNIQUE NOT NULL,
  fecha TIMESTAMPTZ NOT NULL,
  operador_id TEXT REFERENCES operadores(id),
  cliente_id UUID REFERENCES clientes(id),
  tipo_articulo TEXT REFERENCES tipos_articulo(codigo),
  descripcion TEXT DEFAULT 'NULO',
  vr_prestado NUMERIC(12,2) NOT NULL,
  vr_retiro NUMERIC(12,2) NOT NULL,
  utilidad NUMERIC(12,2),
  total NUMERIC(12,2),
  llevar TEXT DEFAULT '',
  vr_intereses NUMERIC(12,2) DEFAULT 0,
  vr_abonado NUMERIC(12,2) DEFAULT 0,
  espera TEXT DEFAULT '',
  fecha_espera TIMESTAMPTZ,
  retiros TEXT DEFAULT '',
  fecha_retiro TIMESTAMPTZ,
  descuento NUMERIC(12,2) DEFAULT 0,
  aumento TEXT DEFAULT '',
  fecha_aumento TIMESTAMPTZ,
  estado TEXT DEFAULT 'activo'
    CHECK (estado IN ('activo', 'retirado', 'salida', 'vendido', 'devuelto', 'saca')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_empenos_numero ON empenos(numero);
CREATE INDEX idx_empenos_estado ON empenos(estado);
CREATE INDEX idx_empenos_cliente ON empenos(cliente_id);
CREATE INDEX idx_empenos_fecha ON empenos(fecha);
CREATE INDEX idx_empenos_retiros ON empenos(retiros) WHERE retiros != '';

-- 5. MOVIMIENTOS
CREATE TABLE movimientos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empeno_id UUID REFERENCES empenos(id) ON DELETE SET NULL,
  numero INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'ABONO','INTERESES','PEDIR_SIN_PAGAR','ESPERA',
    'SALIDA','AUMENTO','VENTAS','DEVOLUCION',
    'BAR','GUARDADERO','GASTOS','CAJA','CONTROL','INGRESO'
  )),
  fecha TIMESTAMPTZ NOT NULL,
  operador_id TEXT REFERENCES operadores(id),
  valor NUMERIC(12,2),
  descuento NUMERIC(12,2),
  retiros TEXT,
  intereses NUMERIC(12,2),
  aumento TEXT,
  descripcion TEXT,
  detalle JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_movimientos_empeno ON movimientos(empeno_id);
CREATE INDEX idx_movimientos_numero ON movimientos(numero);
CREATE INDEX idx_movimientos_tipo ON movimientos(tipo);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha);

-- 6. CAJA
CREATE TABLE caja (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  turno TEXT NOT NULL REFERENCES operadores(id),
  base NUMERIC(12,2) DEFAULT 0,
  retiros NUMERIC(12,2) DEFAULT 0,
  guardadero NUMERIC(12,2) DEFAULT 0,
  bar NUMERIC(12,2) DEFAULT 0,
  contratos NUMERIC(12,2) DEFAULT 0,
  gastos NUMERIC(12,2) DEFAULT 0,
  ventas NUMERIC(12,2) DEFAULT 0,
  cuadre NUMERIC(12,2)
    GENERATED ALWAYS AS (
      COALESCE(base,0) + COALESCE(retiros,0) + COALESCE(guardadero,0) +
      COALESCE(bar,0) + COALESCE(contratos,0) + COALESCE(ventas,0) - COALESCE(gastos,0)
    ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fecha, turno)
);

CREATE INDEX idx_caja_fecha ON caja(fecha);

-- 7. SALIDAS
CREATE TABLE salidas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empeno_id UUID REFERENCES empenos(id),
  numero INTEGER NOT NULL,
  fecha TIMESTAMPTZ NOT NULL,
  operador_id TEXT REFERENCES operadores(id),
  valor_pagado NUMERIC(12,2),
  descuento NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_salidas_numero ON salidas(numero);
CREATE INDEX idx_salidas_fecha ON salidas(fecha);

-- 8. RETIROS (VIEW)
CREATE VIEW retiros AS
SELECT
  e.id, e.numero, e.fecha, e.operador_id, e.tipo_articulo, e.descripcion,
  e.vr_prestado, e.vr_retiro, e.vr_abonado, e.vr_intereses,
  e.retiros, e.fecha_retiro, e.espera, e.aumento, e.estado,
  c.nombre AS nombre_cliente, c.documento AS cedula
FROM empenos e
LEFT JOIN clientes c ON e.cliente_id = c.id
WHERE e.retiros IN ('RETIRAR', 'RETIRAR, MAÑANA', 'MAÑANA')
  AND e.estado = 'activo';

-- 9. SACA
CREATE TABLE saca (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empeno_id UUID REFERENCES empenos(id),
  numero INTEGER NOT NULL,
  fecha_empeno TIMESTAMPTZ,
  fecha_saca TIMESTAMPTZ DEFAULT now(),
  operador_id TEXT REFERENCES operadores(id),
  vr_prestado NUMERIC(12,2),
  vr_retiro NUMERIC(12,2),
  nombre_cliente TEXT,
  cedula TEXT,
  tipo_articulo TEXT,
  descripcion TEXT,
  estado TEXT DEFAULT 'en_saca' CHECK (estado IN ('en_saca', 'vendido')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saca_numero ON saca(numero);

-- 10. VENDIDO
CREATE TABLE vendido (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  saca_id UUID REFERENCES saca(id),
  empeno_id UUID REFERENCES empenos(id),
  numero INTEGER NOT NULL,
  fecha_venta TIMESTAMPTZ DEFAULT now(),
  operador_id TEXT REFERENCES operadores(id),
  valor_venta NUMERIC(12,2),
  vr_prestado NUMERIC(12,2),
  utilidad NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. XALE
CREATE TABLE xale (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empeno_id UUID REFERENCES empenos(id),
  numero INTEGER NOT NULL,
  fecha TIMESTAMPTZ DEFAULT now(),
  operador_id TEXT REFERENCES operadores(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. DEV
CREATE TABLE dev (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empeno_id UUID REFERENCES empenos(id),
  numero INTEGER NOT NULL,
  fecha TIMESTAMPTZ DEFAULT now(),
  operador_id TEXT REFERENCES operadores(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. BAR
CREATE TABLE bar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL,
  turno TEXT REFERENCES operadores(id),
  valor NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. GUARDADERO
CREATE TABLE guardadero (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL,
  turno TEXT REFERENCES operadores(id),
  valor NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. GASTOS
CREATE TABLE gastos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL,
  turno TEXT REFERENCES operadores(id),
  valor NUMERIC(12,2) NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TRIGGER: updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER empenos_updated_at
  BEFORE UPDATE ON empenos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER caja_updated_at
  BEFORE UPDATE ON caja
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- FUNCIÓN: obtener o crear registro de caja del día
CREATE OR REPLACE FUNCTION obtener_o_crear_caja(p_fecha DATE, p_turno TEXT)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM caja WHERE fecha = p_fecha AND turno = p_turno;
  IF NOT FOUND THEN
    INSERT INTO caja (fecha, turno) VALUES (p_fecha, p_turno) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- FUNCIÓN: acumular valor en campo de caja
CREATE OR REPLACE FUNCTION acumular_caja(
  p_fecha DATE,
  p_turno TEXT,
  p_campo TEXT,
  p_valor NUMERIC
) RETURNS VOID AS $$
BEGIN
  PERFORM obtener_o_crear_caja(p_fecha, p_turno);
  EXECUTE format(
    'UPDATE caja SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE fecha = $2 AND turno = $3',
    p_campo, p_campo
  ) USING p_valor, p_fecha, p_turno;
END;
$$ LANGUAGE plpgsql;

-- EXTENSIÓN para búsqueda fuzzy
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_clientes_nombre_trgm ON clientes USING gin(nombre gin_trgm_ops);
