import { FeaturedProducts } from '../components/FeaturedProducts';

export function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>Find the right product</h1>
        <p>Browse featured picks, explore categories or search the catalogue. Questions? Send our sales team an enquiry from any product or category.</p>
      </section>
      <FeaturedProducts />
    </>
  );
}
