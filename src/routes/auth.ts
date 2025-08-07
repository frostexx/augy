import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// Simple in-memory user store (replace with database in production)
const users = new Map();

// Default admin user
const defaultAdmin = {
  username: 'admin',
  password: '$2a$10$rOzE7.3WfRZ1X8QQwF8YQ.j6.r6nYr8FJQ8RQmQZzY0r6K8S9s6Y2', // 'admin123'
  role: 'admin'
};
users.set('admin', defaultAdmin);

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = users.get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { username: user.username, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.json({ token, username: user.username, role: user.role });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify token middleware
export function verifyToken(req: any, res: any, next: any) {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export { router as authRouter };