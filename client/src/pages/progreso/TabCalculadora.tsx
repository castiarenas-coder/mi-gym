import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useGuardarPerfil, usePerfil } from '../../api/progreso'
import type { Perfil, RespuestaPerfil } from '../../api/tipos'
import { fechaCorta, kg, miles } from '../../lib/formato'

const ACTIVIDADES: { valor: NonNullable<Perfil['actividad']>; texto: string }[] = [
  { valor: 'sedentario', texto: 'Sedentario (casi sin ejercicio)' },
  { valor: 'ligero', texto: 'Ligero (1 a 3 días por semana)' },
  { valor: 'moderado', texto: 'Moderado (3 a 5 días por semana)' },
  { valor: 'intenso', texto: 'Intenso (6 a 7 días por semana)' },
  { valor: 'muy_intenso', texto: 'Muy intenso (doble turno o trabajo físico)' },
]
const OBJETIVOS: { valor: NonNullable<Perfil['objetivo']>; texto: string }[] = [
  { valor: 'bajar', texto: 'Bajar de peso (−20 % de calorías)' },
  { valor: 'mantener', texto: 'Mantener el peso' },
  { valor: 'subir', texto: 'Subir masa muscular (+10 % de calorías)' },
]

const aNumero = (t: string): number | null => {
  const n = Number(t.trim().replace(',', '.'))
  return t.trim() !== '' && Number.isFinite(n) ? n : null
}

function Formulario({ datos }: { datos: RespuestaPerfil }) {
  const guardar = useGuardarPerfil()
  const p = datos.perfil
  const [altura, setAltura] = useState(p.altura_cm === null ? '' : String(p.altura_cm))
  const [edad, setEdad] = useState(p.edad === null ? '' : String(p.edad))
  const [sexo, setSexo] = useState<string>(p.sexo ?? '')
  const [actividad, setActividad] = useState<string>(p.actividad ?? '')
  const [objetivo, setObjetivo] = useState<string>(p.objetivo ?? '')
  const [error, setError] = useState<string | null>(null)

  const alEnviar = (ev: FormEvent) => {
    ev.preventDefault()
    setError(null)
    const cuerpo: Partial<Perfil> = {}
    const a = aNumero(altura)
    const e = aNumero(edad)
    if (a !== null) cuerpo.altura_cm = a
    if (e !== null) cuerpo.edad = Math.round(e)
    if (sexo) cuerpo.sexo = sexo as Perfil['sexo']
    if (actividad) cuerpo.actividad = actividad as Perfil['actividad']
    if (objetivo) cuerpo.objetivo = objetivo as Perfil['objetivo']
    if (!Object.keys(cuerpo).length) { setError('Completá al menos un dato.'); return }
    guardar.mutate(cuerpo, { onError: er => setError(er.message) })
  }

  return (
    <form className="tarjeta formulario-medidas" onSubmit={alEnviar} aria-label="Tus datos">
      <h2 className="seccion__titulo">Tus datos</h2>
      <div className="grilla-campos">
        <label className="campo">
          <span className="campo__etiqueta">Altura (cm)</span>
          <input className="control" inputMode="decimal" value={altura} onChange={ev => setAltura(ev.target.value)} />
        </label>
        <label className="campo">
          <span className="campo__etiqueta">Edad (años)</span>
          <input className="control" inputMode="numeric" value={edad} onChange={ev => setEdad(ev.target.value)} />
        </label>
        <label className="campo">
          <span className="campo__etiqueta">Sexo</span>
          <select className="control" value={sexo} onChange={ev => setSexo(ev.target.value)}>
            <option value="">Elegí una opción</option>
            <option value="hombre">Hombre</option>
            <option value="mujer">Mujer</option>
          </select>
        </label>
      </div>
      <label className="campo">
        <span className="campo__etiqueta">Actividad física</span>
        <select className="control" value={actividad} onChange={ev => setActividad(ev.target.value)}>
          <option value="">Elegí una opción</option>
          {ACTIVIDADES.map(a => <option key={a.valor} value={a.valor}>{a.texto}</option>)}
        </select>
      </label>
      <label className="campo">
        <span className="campo__etiqueta">Objetivo</span>
        <select className="control" value={objetivo} onChange={ev => setObjetivo(ev.target.value)}>
          <option value="">Elegí una opción</option>
          {OBJETIVOS.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      </label>
      {error && <p className="aviso aviso--error" role="alert">{error}</p>}
      <button type="submit" className="boton boton--principal" disabled={guardar.isPending}>Calcular y guardar</button>
    </form>
  )
}

function Resultados({ datos }: { datos: RespuestaPerfil }) {
  const { calculos: c, peso_kg } = datos
  if (peso_kg === null) {
    return (
      <p className="aviso aviso--suave">
        Para calcular necesitamos tu peso: cargá tu peso en <Link className="enlace" to="/progreso?tab=medidas">Medidas</Link>.
      </p>
    )
  }
  if (!c || (c.imc === null && c.bmr === null)) {
    return <p className="aviso">Completá tus datos y tocá “Calcular y guardar” para ver los resultados.</p>
  }
  return (
    <section className="tarjeta" aria-label="Resultados">
      <h2 className="seccion__titulo">Resultados</h2>
      <p className="bloque__ayuda">Calculado con tu último peso: {kg(peso_kg)} kg{datos.fecha_peso ? ` (${fechaCorta(datos.fecha_peso)})` : ''}.</p>
      <dl className="estadisticas">
        {c.imc !== null && (
          <div className="estadistica">
            <dt>IMC</dt>
            <dd>{kg(c.imc)}</dd>
            {c.categoria_imc && <span className="estadistica__nota estadistica__nota--acento">{c.categoria_imc}</span>}
          </div>
        )}
        {c.bmr !== null && <div className="estadistica"><dt>Metabolismo basal</dt><dd>{miles(c.bmr)} kcal</dd></div>}
        {c.tdee !== null && <div className="estadistica"><dt>Calorías de mantenimiento</dt><dd>{miles(c.tdee)} kcal</dd></div>}
        {c.kcal_objetivo !== null && <div className="estadistica estadistica--destacada"><dt>Calorías para tu objetivo</dt><dd>{miles(c.kcal_objetivo)} kcal</dd></div>}
      </dl>
      {c.macros && (
        <>
          <h3 className="seccion__subtitulo">Macros sugeridos por día</h3>
          <dl className="estadisticas">
            <div className="estadistica"><dt>Proteína</dt><dd>{c.macros.proteina_g} g</dd></div>
            <div className="estadistica"><dt>Carbohidratos</dt><dd>{c.macros.carbohidratos_g} g</dd></div>
            <div className="estadistica"><dt>Grasas</dt><dd>{c.macros.grasa_g} g</dd></div>
          </dl>
        </>
      )}
      <p className="bloque__ayuda">Son valores orientativos (fórmula de Mifflin-St Jeor). Ajustalos según cómo responda tu cuerpo; no reemplazan la consulta con un profesional.</p>
    </section>
  )
}

export function TabCalculadora() {
  const perfil = usePerfil()
  if (perfil.isPending) return <p className="aviso">Cargando…</p>
  if (perfil.isError) return <p className="aviso aviso--error" role="alert">No pudimos cargar tu perfil.</p>
  return (
    <>
      <Formulario key={JSON.stringify(perfil.data.perfil)} datos={perfil.data} />
      <Resultados datos={perfil.data} />
    </>
  )
}
