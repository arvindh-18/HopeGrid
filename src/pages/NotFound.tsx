import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';

export default function NotFound() {
  return (
    <Layout>
      <div className="max-w-lg py-10">
        <h1 className="t-title-lg">This page doesn't exist</h1>
        <p className="mt-3 text-muted">The link may be old or mistyped.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/" className="btn btn-primary">Go to home</Link>
          <Link to="/report" className="btn btn-danger">Report an emergency</Link>
        </div>
      </div>
    </Layout>
  );
}
