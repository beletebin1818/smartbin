/**
 * Socket.io connection handler
 *
 * Phase 1: Connection verification only.
 * Game events (draw, join, win) will be added in Phase 2.
 */

function initSockets(io) {
  io.on('connection', (socket) => {
    // Client can identify itself as a player or admin
    socket.on('identify', ({ role, userId }) => {
      if (role === 'player') {
        socket.join(`player_${userId}`);
      } else if (role === 'admin') {
        socket.join('admin_room');
      }

      socket.emit('identified', {
        success: true,
        socketId: socket.id,
        message: 'Connection confirmed by Red Bingos server',
      });
    });

    // Join game room to receive ticks and draw events
    socket.on('join_game', ({ gameId }) => {
      socket.join(`game_${gameId}`);
      socket.emit('joined_room', { success: true, room: `game_${gameId}` });
    });

    // Leave game room
    socket.on('leave_game', ({ gameId }) => {
      socket.leave(`game_${gameId}`);
      socket.emit('left_room', { success: true, room: `game_${gameId}` });
    });

    // Ping / heartbeat
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      // Disconnected cleanly
    });

    socket.on('error', (err) => {
      console.error(`⚠️  Socket error | id: ${socket.id} |`, err.message, err);
    });
  });
}

module.exports = { initSockets };
