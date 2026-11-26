import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Dumbbell } from 'lucide-react';
import { NOMBRE_APP } from '../../lib/marca';
import { Marca } from './Marca';
import { EstadoVacio } from './EstadoVacio';
import { Metrica } from './Metrica';
import { CabeceraPagina } from './CabeceraPagina';

describe('Marca', () => {
  it('muestra el nombre de la app', () => {
    render(<Marca />);
    expect(screen.getByText(NOMBRE_APP)).toBeInTheDocument();
  });

  it('compacta solo tiene aria-label y no muestra el texto', () => {
    render(<Marca compacta />);
    expect(screen.getByLabelText(NOMBRE_APP)).toBeInTheDocument();
    expect(screen.queryByText(NOMBRE_APP)).not.toBeInTheDocument();
  });
  it('dibuja la brújula: anillo, aguja con mitad norte y punto central', () => {
    const { container } = render(<Marca />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 96 96');
    expect(container.querySelector('circle[r="40"]')).not.toBeNull();
    expect(container.querySelector('path[d="M48 16 L60 48 L48 80 L36 48 Z"]')).not.toBeNull();
    expect(container.querySelector('path[d="M48 16 L60 48 L36 48 Z"]')).not.toBeNull();
    expect(container.querySelector('circle[r="5"]')).not.toBeNull();
  });
});

describe('EstadoVacio', () => {
  it('con accion renderiza un link con texto y href', () => {
    render(
      <MemoryRouter>
        <EstadoVacio icono={Dumbbell} titulo="Nada" texto="Todavía no hay" accion={{ texto: 'Crear', a: '/rutinas' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Nada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear' })).toHaveAttribute('href', '/rutinas');
  });

  it('sin accion no renderiza link', () => {
    render(
      <MemoryRouter>
        <EstadoVacio icono={Dumbbell} titulo="Nada" texto="Todavía no hay" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('Metrica', () => {
  it('muestra valor, unidad y etiqueta', () => {
    render(<Metrica valor={1200} unidad="kg" etiqueta="Volumen" />);
    expect(screen.getByText('1200')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(screen.getByText('Volumen')).toBeInTheDocument();
  });
});

describe('CabeceraPagina', () => {
  it('muestra titulo y accion', () => {
    render(<CabeceraPagina titulo="Rutinas" accion={<button>Nueva</button>} />);
    expect(screen.getByRole('heading', { name: 'Rutinas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva' })).toBeInTheDocument();
  });
});
