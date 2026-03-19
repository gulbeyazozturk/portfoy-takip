const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const userId = (process.argv[2] || '').trim();
  const portfolioId = (process.argv[3] || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!userId || !portfolioId) {
    throw new Error('Usage: node scripts/delete-user-portfolio.js <user_id> <portfolio_id>');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: deleted, error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', portfolioId)
    .eq('user_id', userId)
    .select('id,user_id,name,created_at');

  if (error) throw error;

  console.log(JSON.stringify({ deleted }, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
