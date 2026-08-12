/**
 * Admin User Controller
 */

const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');

const ALLOWED_ROLES = ['super_admin', 'admin', 'moderator', 'support'];

const ADMIN_SELECT = {
  id: true, username: true, firstName: true, lastName: true,
  role: true, status: true, jobTitle: true, createdAt: true,
};

async function list(req, res, next) {
  try {
    const users = await prisma.adminUser.findMany({
      select: ADMIN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: users });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { username, password, firstName, lastName, role, jobTitle, status } = req.body;
    // lastName is optional — a single-word full name (e.g. "Admin") is valid
    if (!username || !password || !firstName) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.adminUser.create({
      data: {
        username, password: hash, firstName, lastName: lastName || '',
        role: role || 'admin',
        jobTitle: jobTitle || null,
        status: status !== undefined ? Boolean(status) : true,
      },
      select: ADMIN_SELECT,
    });

    if (req.io) {
      req.io.to('admin_room').emit('admin_users:updated', { id: user.id, action: 'created' });
    }

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Username already exists' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const { username, firstName, lastName, role, status, jobTitle, password } = req.body;

    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = Boolean(status);
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const user = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: ADMIN_SELECT,
    });

    if (req.io) {
      req.io.to('admin_room').emit('admin_users:updated', { id, action: 'updated' });
    }

    return res.json({ success: true, data: user });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Username already exists' });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    // Prevent deleting yourself
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }
    await prisma.adminUser.delete({ where: { id } });

    if (req.io) {
      req.io.to('admin_room').emit('admin_users:updated', { id, action: 'deleted' });
    }

    return res.json({ success: true, message: 'Admin user deleted' });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
