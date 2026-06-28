import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useAdminAuth } from '../providers/AdminAuthProvider';

export function LoginPage() {
  const { login } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3} component="form" onSubmit={handleSubmit}>
            <Box>
              <Typography variant="h5" fontWeight={700}>
                Admin Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Sign in with your admin account
              </Typography>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              autoComplete="email"
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || !email || !password}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
