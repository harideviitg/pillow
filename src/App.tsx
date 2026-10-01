import { Band, Prototype } from './prototype/Prototype';

export function App() {
  return (
    <main className="page">
      <div className="page-rules" aria-hidden="true" />
      <div className="page-top" />
      <Prototype />
      <Band />
    </main>
  );
}
