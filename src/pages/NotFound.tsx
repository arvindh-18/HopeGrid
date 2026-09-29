import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useI18n } from '../i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <Layout>
      <div className="max-w-lg py-10">
        <h1 className="t-title-lg">{t('notFound.title')}</h1>
        <p className="mt-3 text-muted">{t('notFound.body')}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/" className="btn btn-primary">{t('notFound.home')}</Link>
          <Link to="/report" className="btn btn-danger">{t('home.cta')}</Link>
        </div>
      </div>
    </Layout>
  );
}
