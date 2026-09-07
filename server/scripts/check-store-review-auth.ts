import { checkStoreReviewAuth } from '../store-review-check';

const apiUrl = process.argv[2] || process.env.STORE_REVIEW_API_URL;
if (!apiUrl) {
  console.error('Usage: npm run check:store-review -- https://api.taxigr.ru');
  process.exitCode = 1;
} else {
  try {
    const checks = await checkStoreReviewAuth(apiUrl);
    console.log(checks.join('\n'));
    console.log('Store review login, passenger profile and session refresh verified.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Store review login check failed');
    process.exitCode = 1;
  }
}
