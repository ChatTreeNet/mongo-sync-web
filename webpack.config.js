const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/client/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/client/index.html',
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    port: 3001,
    hot: true,
    proxy: [{
      context: ['/api'],
      target: 'http://localhost:5002',
      secure: false,
      changeOrigin: true,
      logLevel: 'debug',
      onProxyReq: (proxyReq, req, res) => {
        console.log('\n=== Proxy Request ===');
        console.log('Method:', req.method);
        console.log('Path:', req.path);
        console.log('Headers:', req.headers);
        
        if (req.body) {
          const bodyData = JSON.stringify(req.body);
          console.log('Request body:', bodyData);
          
          // Handle POST requests
          if (req.method === 'POST') {
            // Update headers
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            
            // Write body to request
            proxyReq.write(bodyData);
          }
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log('\n=== Proxy Response ===');
        console.log('Status:', proxyRes.statusCode);
        console.log('Headers:', proxyRes.headers);
        
        let responseBody = '';
        proxyRes.on('data', chunk => {
          responseBody += chunk.toString('utf8');
        });
        
        proxyRes.on('end', () => {
          console.log('Response body:', responseBody);
          try {
            // const parsedBody = JSON.parse(responseBody);
            console.log('Parsed response:', responseBody);
          } catch (e) {
            console.error('Failed to parse response body:', e);
          }
        });
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.writeHead(500, {
          'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({ 
          error: 'Proxy error', 
          message: err.message,
          details: err.stack
        }));
      }
    }],
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }

      // Add request logging middleware
      devServer.app.use((req, res, next) => {
        console.log('\n=== Dev Server Request ===');
        console.log('Method:', req.method);
        console.log('URL:', req.url);
        console.log('Headers:', req.headers);
        if (req.body) {
          console.log('Body:', req.body);
        }
        next();
      });

      return middlewares;
    }
  },
};
