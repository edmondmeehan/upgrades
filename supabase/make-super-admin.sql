-- Run once in the Supabase SQL editor after you've created your own account in the app.
update public.profiles set is_super_admin = true where email = 'eddie@please.co';
