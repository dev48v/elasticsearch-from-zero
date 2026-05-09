import { Link, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Detail } from './pages/Detail';
import { Footer } from './components/Footer';

export const App = () => (
  <div className="app">
    <header className="header">
      <Link to="/" className="brand">
        <span className="brand-dot" />
        <span>Recipe Search</span>
        <span className="brand-tag">Elasticsearch From Zero</span>
      </Link>
    </header>
    <main className="main">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/recipe/:id" element={<Detail />} />
      </Routes>
    </main>
    <Footer />
  </div>
);
