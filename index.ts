import { cookie } from '@elysiajs/cookie';
import { jwt } from '@elysiajs/jwt';
import { Elysia, t } from 'elysia';
import postgres from 'postgres';

const config = {
  jwt: { secret: process.env.JWT_SECRET || 'your_jwt_secret_key_here' },
  admin: { apiKey: process.env.ADMIN_API_KEY || 'your_secure_admin_key_here' },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'irctc_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  }
};

const sql = postgres({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  username: config.db.user,
  password: config.db.password,
  max: 10
});

const app = new Elysia()
  .use(cookie())
  .use(jwt({
    name: 'jwt',
    secret: config.jwt.secret
  }));

const verifyToken = async (context: any) => {
  const { headers, jwt, set } = context;
  try {
    const authCookie = headers.cookie;
    if (!authCookie) {
      set.status = 401;
      return { error: 'Authentication required' };
    }

    const cookies = authCookie.split(';').reduce((acc: any, cookie: string) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});

    const token = cookies.auth;
    if (!token) {
      set.status = 401;
      return { error: 'Authentication required' };
    }

    const decoded = await jwt.verify(token);
    if (!decoded) {
      set.status = 401;
      return { error: 'Invalid token' };
    }

    context.user = decoded;
  } catch (error) {
    set.status = 401;
    return { error: 'Invalid authentication token' };
  }
};

const verifyAdmin = async ({ headers, set }: any) => {
  const apiKey = headers['x-api-key'];
  if (apiKey !== config.admin.apiKey) {
    set.status = 401;
    return { error: 'Invalid admin API key' };
  }
};

const initDB = async () => {
  try {
    await sql`DROP TABLE IF EXISTS bookings`;
    await sql`DROP TABLE IF EXISTS trains`;
    await sql`DROP TABLE IF EXISTS users`;

    await sql`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE
      )
    `;

    await sql`
      CREATE TABLE trains (
        id SERIAL PRIMARY KEY,
        train_number VARCHAR(20) UNIQUE NOT NULL,
        source VARCHAR(100) NOT NULL,
        destination VARCHAR(100) NOT NULL,
        total_seats INTEGER NOT NULL CHECK (total_seats > 0)
      )
    `;

    await sql`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        train_id INTEGER REFERENCES trains(id) ON DELETE CASCADE,
        seat_number INTEGER NOT NULL CHECK (seat_number > 0),
        booking_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(train_id, seat_number)
      )
    `;

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

app
  .post('/api/register', async ({ body, set }) => {
    const { username, password, isAdmin = false } = body;
    try {
      const hashedPassword = await Bun.password.hash(password);
      const result = await sql`
        INSERT INTO users (username, password, is_admin)
        VALUES (${username}, ${hashedPassword}, ${isAdmin})
        RETURNING id, username, is_admin
      `;

      return {
        success: true,
        user: {
          id: result[0].id,
          username: result[0].username,
          isAdmin: result[0].is_admin
        }
      };
    } catch (error: any) {
      set.status = 400;
      if (error.code === '23505') {
        return { error: 'Username already exists' };
      }
      return { error: 'Registration failed' };
    }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
      isAdmin: t.Optional(t.Boolean())
    })
  })

  .post('/api/login', async ({ body, jwt, set }) => {
    const { username, password } = body;
    try {
      console.log('Login attempt for:', username);
      const result = await sql`
        SELECT * FROM users WHERE username = ${username}
      `;

      if (result.length === 0) {
        set.status = 401;
        return { error: 'Invalid credentials' };
      }

      const user = result[0];
      const isValid = await Bun.password.verify(password, user.password);

      if (!isValid) {
        set.status = 401;
        return { error: 'Invalid credentials' };
      }

      const token = await jwt.sign({
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin
      });

      set.headers['Set-Cookie'] = `auth=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`;

      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.is_admin
        }
      };
    } catch (error) {
      console.error('Login error:', error);
      set.status = 500;
      return { error: 'Login failed' };
    }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  })

  .post('/api/trains', async ({ body, set }) => {
    const { trainNumber, source, destination, totalSeats } = body;
    try {
      const result = await sql`
        INSERT INTO trains (train_number, source, destination, total_seats)
        VALUES (${trainNumber}, ${source}, ${destination}, ${totalSeats})
        RETURNING *
      `;
      return { success: true, train: result[0] };
    } catch (error: any) {
      set.status = 400;
      if (error.code === '23505') {
        return { error: 'Train number already exists' };
      }
      return { error: 'Failed to add train' };
    }
  }, {
    beforeHandle: [verifyAdmin],
    body: t.Object({
      trainNumber: t.String(),
      source: t.String(),
      destination: t.String(),
      totalSeats: t.Number({ minimum: 1 })
    })
  })

  .get('/api/availability', async ({ query, set }) => {
    const { source, destination } = query;
    try {
      const trains = await sql`
        SELECT
          t.*,
          t.total_seats - COALESCE(COUNT(b.id), 0) as available_seats
        FROM trains t
        LEFT JOIN bookings b ON t.id = b.train_id
        WHERE LOWER(t.source) = LOWER(${source})
          AND LOWER(t.destination) = LOWER(${destination})
        GROUP BY t.id
        HAVING t.total_seats - COALESCE(COUNT(b.id), 0) > 0
      `;
      return { success: true, trains };
    } catch (error) {
      set.status = 500;
      return { error: 'Failed to fetch availability' };
    }
  }, {
    query: t.Object({
      source: t.String(),
      destination: t.String()
    })
  })

  .post('/api/bookings', async (context) => {
    await verifyToken(context);

    const { body, set, user } = context;
    const { trainId } = body;

    if (!user) {
      set.status = 401;
      return { error: 'Authentication required' };
    }

    try {
      const booking = await sql.begin(async (tx) => {
        const [train] = await tx`
          SELECT id, total_seats
          FROM trains
          WHERE id = ${trainId}
          FOR UPDATE
        `;

        if (!train) {
          throw new Error('Train not found');
        }

        const [bookingCount] = await tx`
          SELECT COUNT(*) as count
          FROM bookings
          WHERE train_id = ${trainId}
        `;

        if (bookingCount.count >= train.total_seats) {
          throw new Error('No seats available');
        }

        const [nextSeat] = await tx`
          SELECT seat as next_seat
          FROM generate_series(1, ${train.total_seats}) seat
          WHERE seat NOT IN (
            SELECT seat_number
            FROM bookings
            WHERE train_id = ${trainId}
          )
          ORDER BY seat
          LIMIT 1
        `;

        const [newBooking] = await tx`
          INSERT INTO bookings (user_id, train_id, seat_number)
          VALUES (${user.id}, ${trainId}, ${nextSeat.next_seat})
          RETURNING id, user_id, train_id, seat_number, booking_date
        `;

        return {
          id: newBooking.id,
          userId: newBooking.user_id,
          trainId: newBooking.train_id,
          seatNumber: newBooking.seat_number,
          bookingDate: newBooking.booking_date
        };
      });

      return { success: true, booking };
    } catch (error: any) {
      console.error('Booking error:', error);
      set.status = error.message === 'Train not found' ? 404 : 400;
      return { error: error.message };
    }
  }, {
    body: t.Object({
      trainId: t.Number()
    })
  })

  .get('/api/bookings/:id', async (context) => {
    await verifyToken(context);

    const { params, set, user } = context;
    const { id } = params;

    if (!user) {
      set.status = 401;
      return { error: 'Authentication required' };
    }

    try {
      const [booking] = await sql`
        SELECT
          b.*,
          t.train_number,
          t.source,
          t.destination
        FROM bookings b
        JOIN trains t ON b.train_id = t.id
        WHERE b.id = ${id} AND b.user_id = ${user.id}
      `;

      if (!booking) {
        set.status = 404;
        return { error: 'Booking not found' };
      }

      return { success: true, booking };
    } catch (error) {
      set.status = 500;
      return { error: 'Failed to fetch booking details' };
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });

const startServer = async () => {
  try {
    await initDB();
    app.listen(3000);
    console.log('Server running on http://localhost:3000');
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
};

startServer();
