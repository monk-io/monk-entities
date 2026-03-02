import * as dotenv from 'dotenv';
import * as https from 'https';
import * as http from 'http';

// Load environment variables
dotenv.config();

interface NeptuneConfig {
  host: string;
  port: number;
  useSSL: boolean;
  timeout: number;
}

interface Vertex {
  id: string;
  label: string;
  properties: Record<string, any>;
}

interface Edge {
  id: string;
  label: string;
  from: string;
  to: string;
  properties: Record<string, any>;
}

interface GremlinResponse {
  requestId: string;
  status: {
    code: number;
    message: string;
  };
  result: {
    data: any;
  };
}

/**
 * Neptune Graph Database Client
 * Uses Neptune's HTTP endpoint for Gremlin queries
 */
class NeptuneClient {
  private config: NeptuneConfig;

  constructor(config: NeptuneConfig) {
    this.config = config;
  }

  /**
   * Execute a Gremlin query against Neptune
   */
  async executeGremlin(query: string): Promise<any> {
    const postData = JSON.stringify({ gremlin: query });
    
    const options: https.RequestOptions = {
      hostname: this.config.host,
      port: this.config.port,
      path: '/gremlin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: this.config.timeout,
      rejectUnauthorized: false // For Neptune SSL
    };

    return new Promise((resolve, reject) => {
      const protocol = this.config.useSSL ? https : http;
      
      const req = protocol.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response: GremlinResponse = JSON.parse(data);
            if (response.status.code >= 400) {
              reject(new Error(`Gremlin error: ${response.status.message}`));
            } else {
              resolve(response.result.data);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Test connection to Neptune
   */
  async testConnection(): Promise<boolean> {
    try {
      // Simple query to test connection
      await this.executeGremlin('g.V().limit(1).count()');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Neptune status via HTTP endpoint
   */
  async getStatus(): Promise<any> {
    const options: https.RequestOptions = {
      hostname: this.config.host,
      port: this.config.port,
      path: '/status',
      method: 'GET',
      timeout: this.config.timeout,
      rejectUnauthorized: false
    };

    return new Promise((resolve, reject) => {
      const protocol = this.config.useSSL ? https : http;
      
      const req = protocol.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  // ============================================
  // Vertex Operations
  // ============================================

  /**
   * Create a vertex (node) in the graph
   */
  async createVertex(label: string, properties: Record<string, any>): Promise<Vertex> {
    let query = `g.addV('${label}')`;
    
    for (const [key, value] of Object.entries(properties)) {
      const escapedValue = typeof value === 'string' 
        ? `'${value.replace(/'/g, "\\'")}'` 
        : value;
      query += `.property('${key}', ${escapedValue})`;
    }
    
    const result = await this.executeGremlin(query);
    
    // Parse the result to return a clean vertex object
    if (result && result['@value'] && result['@value'].length > 0) {
      const v = result['@value'][0];
      return this.parseVertex(v);
    }
    
    throw new Error('Failed to create vertex');
  }

  /**
   * Get all vertices with a specific label
   */
  async getVerticesByLabel(label: string): Promise<Vertex[]> {
    const query = `g.V().hasLabel('${label}').elementMap()`;
    const result = await this.executeGremlin(query);
    
    if (result && result['@value']) {
      return result['@value'].map((v: any) => this.parseVertexFromElementMap(v));
    }
    
    return [];
  }

  /**
   * Get a vertex by ID
   */
  async getVertexById(id: string): Promise<Vertex | null> {
    const query = `g.V('${id}').elementMap()`;
    const result = await this.executeGremlin(query);
    
    if (result && result['@value'] && result['@value'].length > 0) {
      return this.parseVertexFromElementMap(result['@value'][0]);
    }
    
    return null;
  }

  /**
   * Update vertex properties
   */
  async updateVertex(id: string, properties: Record<string, any>): Promise<boolean> {
    let query = `g.V('${id}')`;
    
    for (const [key, value] of Object.entries(properties)) {
      const escapedValue = typeof value === 'string' 
        ? `'${value.replace(/'/g, "\\'")}'` 
        : value;
      query += `.property('${key}', ${escapedValue})`;
    }
    
    try {
      await this.executeGremlin(query);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete a vertex by ID
   */
  async deleteVertex(id: string): Promise<boolean> {
    const query = `g.V('${id}').drop()`;
    
    try {
      await this.executeGremlin(query);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Count vertices by label
   */
  async countVertices(label?: string): Promise<number> {
    const query = label 
      ? `g.V().hasLabel('${label}').count()` 
      : 'g.V().count()';
    
    const result = await this.executeGremlin(query);
    
    // Neptune returns count in GraphSON format: {"@type":"g:Int64","@value":5}
    if (result && result['@value'] !== undefined) {
      const value = result['@value'];
      if (typeof value === 'object' && value['@value'] !== undefined) {
        return Number(value['@value']);
      }
      return Number(value);
    }
    
    return 0;
  }

  // ============================================
  // Edge Operations
  // ============================================

  /**
   * Create an edge between two vertices
   */
  async createEdge(fromId: string, toId: string, label: string, properties?: Record<string, any>): Promise<Edge> {
    // Use __.V() for the target vertex in Neptune (anonymous traversal)
    let query = `g.V('${fromId}').addE('${label}').to(__.V('${toId}'))`;
    
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        const escapedValue = typeof value === 'string' 
          ? `'${value.replace(/'/g, "\\'")}'` 
          : value;
        query += `.property('${key}', ${escapedValue})`;
      }
    }
    
    const result = await this.executeGremlin(query);
    
    if (result && result['@value'] && result['@value'].length > 0) {
      return this.parseEdge(result['@value'][0]);
    }
    
    throw new Error('Failed to create edge');
  }

  /**
   * Get all edges with a specific label
   */
  async getEdgesByLabel(label: string): Promise<Edge[]> {
    const query = `g.E().hasLabel('${label}').elementMap()`;
    const result = await this.executeGremlin(query);
    
    if (result && result['@value']) {
      return result['@value'].map((e: any) => this.parseEdgeFromElementMap(e));
    }
    
    return [];
  }

  /**
   * Get edges from a vertex
   */
  async getOutgoingEdges(vertexId: string): Promise<Edge[]> {
    const query = `g.V('${vertexId}').outE().elementMap()`;
    const result = await this.executeGremlin(query);
    
    if (result && result['@value']) {
      return result['@value'].map((e: any) => this.parseEdgeFromElementMap(e));
    }
    
    return [];
  }

  /**
   * Get edges to a vertex
   */
  async getIncomingEdges(vertexId: string): Promise<Edge[]> {
    const query = `g.V('${vertexId}').inE().elementMap()`;
    const result = await this.executeGremlin(query);
    
    if (result && result['@value']) {
      return result['@value'].map((e: any) => this.parseEdgeFromElementMap(e));
    }
    
    return [];
  }

  /**
   * Delete an edge by ID
   */
  async deleteEdge(id: string): Promise<boolean> {
    const query = `g.E('${id}').drop()`;
    
    try {
      await this.executeGremlin(query);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Count edges by label
   */
  async countEdges(label?: string): Promise<number> {
    const query = label 
      ? `g.E().hasLabel('${label}').count()` 
      : 'g.E().count()';
    
    const result = await this.executeGremlin(query);
    
    // Neptune returns count in GraphSON format: {"@type":"g:Int64","@value":5}
    if (result && result['@value'] !== undefined) {
      const value = result['@value'];
      if (typeof value === 'object' && value['@value'] !== undefined) {
        return Number(value['@value']);
      }
      return Number(value);
    }
    
    return 0;
  }

  // ============================================
  // Graph Traversal Operations
  // ============================================

  /**
   * Find neighbors of a vertex
   */
  async getNeighbors(vertexId: string, direction: 'out' | 'in' | 'both' = 'both'): Promise<Vertex[]> {
    let query: string;
    
    switch (direction) {
      case 'out':
        query = `g.V('${vertexId}').out().elementMap()`;
        break;
      case 'in':
        query = `g.V('${vertexId}').in().elementMap()`;
        break;
      default:
        query = `g.V('${vertexId}').both().elementMap()`;
    }
    
    const result = await this.executeGremlin(query);
    
    if (result && result['@value']) {
      return result['@value'].map((v: any) => this.parseVertexFromElementMap(v));
    }
    
    return [];
  }

  /**
   * Find path between two vertices
   */
  async findPath(fromId: string, toId: string, maxDepth: number = 5): Promise<any[]> {
    const query = `g.V('${fromId}').repeat(both().simplePath()).until(hasId('${toId}')).limit(1).path()`;
    
    try {
      const result = await this.executeGremlin(query);
      
      if (result && result['@value']) {
        return result['@value'];
      }
    } catch (error) {
      // No path found
    }
    
    return [];
  }

  /**
   * Clear all data from the graph
   */
  async clearGraph(): Promise<void> {
    await this.executeGremlin('g.V().drop()');
  }

  // ============================================
  // Helper Methods
  // ============================================

  private parseVertex(v: any): Vertex {
    // Neptune returns vertex in GraphSON format
    // Try multiple paths to extract the ID
    let id = 'unknown';
    if (v['@value']?.id?.['@value']) {
      id = String(v['@value'].id['@value']);
    } else if (v['@value']?.id) {
      id = String(v['@value'].id);
    } else if (v.id?.['@value']) {
      id = String(v.id['@value']);
    } else if (v.id) {
      id = String(v.id);
    }
    
    const label = v['@value']?.label || v.label || 'vertex';
    const properties: Record<string, any> = {};
    
    if (v['@value']?.properties) {
      for (const [key, values] of Object.entries(v['@value'].properties)) {
        if (Array.isArray(values) && values.length > 0) {
          properties[key] = (values[0] as any)['@value']?.value || values[0];
        }
      }
    }
    
    return { id: String(id), label, properties };
  }

  private parseVertexFromElementMap(v: any): Vertex {
    const map = v['@value'] || v;
    const result: Vertex = {
      id: '',
      label: '',
      properties: {}
    };
    
    if (Array.isArray(map)) {
      for (let i = 0; i < map.length; i += 2) {
        const key = map[i]?.['@value'] || map[i];
        const value = map[i + 1]?.['@value'] || map[i + 1];
        
        if (key === 'id' || key?.['@value'] === 'id') {
          result.id = String(value);
        } else if (key === 'label' || key?.['@value'] === 'label') {
          result.label = String(value);
        } else {
          result.properties[String(key)] = value;
        }
      }
    }
    
    return result;
  }

  private parseEdge(e: any): Edge {
    const id = e['@value']?.id?.['@value'] || e.id || 'unknown';
    const label = e['@value']?.label || e.label || 'edge';
    const from = e['@value']?.outV?.['@value'] || '';
    const to = e['@value']?.inV?.['@value'] || '';
    
    return { id: String(id), label, from: String(from), to: String(to), properties: {} };
  }

  private parseEdgeFromElementMap(e: any): Edge {
    const map = e['@value'] || e;
    const result: Edge = {
      id: '',
      label: '',
      from: '',
      to: '',
      properties: {}
    };
    
    if (Array.isArray(map)) {
      for (let i = 0; i < map.length; i += 2) {
        const key = map[i]?.['@value'] || map[i];
        const value = map[i + 1]?.['@value'] || map[i + 1];
        
        if (key === 'id' || key?.['@value'] === 'id') {
          result.id = String(value);
        } else if (key === 'label' || key?.['@value'] === 'label') {
          result.label = String(value);
        } else if (key === 'IN' || key?.['@value'] === 'IN') {
          // IN vertex
          if (value && typeof value === 'object') {
            result.to = String(value.id?.['@value'] || value.id || '');
          }
        } else if (key === 'OUT' || key?.['@value'] === 'OUT') {
          // OUT vertex
          if (value && typeof value === 'object') {
            result.from = String(value.id?.['@value'] || value.id || '');
          }
        } else {
          result.properties[String(key)] = value;
        }
      }
    }
    
    return result;
  }
}

/**
 * Neptune Client Demo Application
 */
class NeptuneClientDemo {
  private client: NeptuneClient;
  private config: NeptuneConfig;
  private isRunning: boolean = false;

  constructor(config: NeptuneConfig) {
    this.config = config;
    this.client = new NeptuneClient(config);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('🚀 Neptune Client Demo started');
    console.log(`📊 Graph Database: Amazon Neptune`);
    console.log(`🔗 Endpoint: ${this.config.host}:${this.config.port}`);
    console.log(`🔒 SSL: ${this.config.useSSL ? 'Enabled' : 'Disabled'}`);
    console.log('========================================');

    try {
      // Test connection
      console.log('\n🔌 Testing connection to Neptune...');
      const connected = await this.client.testConnection();
      
      if (!connected) {
        throw new Error('Failed to connect to Neptune');
      }
      
      console.log('✅ Connection established successfully');

      // Get Neptune status
      console.log('\n📋 Neptune Status:');
      try {
        const status = await this.client.getStatus();
        console.log(JSON.stringify(status, null, 2));
      } catch (error) {
        console.log('⚠️  Could not retrieve status (this is normal for some configurations)');
      }

      // Run demo operations
      await this.runDemoOperations();

      // Keep running and perform periodic operations
      const intervalMs = parseInt(process.env.OPERATION_INTERVAL_MS || '10000');
      while (this.isRunning) {
        await this.sleep(intervalMs);
        await this.showGraphStats();
      }

    } catch (error) {
      console.error('❌ Fatal error in Neptune client:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Neptune Client Demo...');
    this.isRunning = false;
    console.log('👋 Neptune Client stopped');
  }

  private async runDemoOperations(): Promise<void> {
    console.log('\n🔄 Running demo operations...');
    console.log('========================================');

    try {
      // Clear existing demo data
      console.log('\n🧹 Clearing existing demo data...');
      await this.client.clearGraph();
      console.log('✅ Graph cleared');

      // Create sample vertices (People)
      console.log('\n👤 Creating sample people vertices...');
      const people = [
        { name: 'Alice', age: 30, city: 'New York', role: 'Engineer' },
        { name: 'Bob', age: 35, city: 'San Francisco', role: 'Manager' },
        { name: 'Charlie', age: 28, city: 'Seattle', role: 'Designer' },
        { name: 'Diana', age: 32, city: 'Austin', role: 'Engineer' },
        { name: 'Eve', age: 27, city: 'Boston', role: 'Analyst' }
      ];

      const personIds: string[] = [];
      for (const person of people) {
        const vertex = await this.client.createVertex('person', person);
        personIds.push(vertex.id);
        console.log(`✅ Created person: ${person.name} (ID: ${vertex.id})`);
      }

      // Create sample vertices (Projects)
      console.log('\n📁 Creating sample project vertices...');
      const projects = [
        { name: 'Project Alpha', status: 'active', budget: 100000 },
        { name: 'Project Beta', status: 'planning', budget: 50000 },
        { name: 'Project Gamma', status: 'completed', budget: 75000 }
      ];

      const projectIds: string[] = [];
      for (const project of projects) {
        const vertex = await this.client.createVertex('project', project);
        projectIds.push(vertex.id);
        console.log(`✅ Created project: ${project.name} (ID: ${vertex.id})`);
      }

      // Create edges (relationships)
      console.log('\n🔗 Creating relationships...');
      
      // Alice works on Project Alpha
      await this.client.createEdge(personIds[0], projectIds[0], 'works_on', { since: '2024-01-01', role: 'lead' });
      console.log('✅ Alice works_on Project Alpha');
      
      // Bob manages Project Alpha
      await this.client.createEdge(personIds[1], projectIds[0], 'manages', { since: '2023-06-01' });
      console.log('✅ Bob manages Project Alpha');
      
      // Charlie works on Project Beta
      await this.client.createEdge(personIds[2], projectIds[1], 'works_on', { since: '2024-02-01', role: 'designer' });
      console.log('✅ Charlie works_on Project Beta');
      
      // Diana works on Project Alpha and Gamma
      await this.client.createEdge(personIds[3], projectIds[0], 'works_on', { since: '2024-01-15', role: 'developer' });
      await this.client.createEdge(personIds[3], projectIds[2], 'works_on', { since: '2023-01-01', role: 'developer' });
      console.log('✅ Diana works_on Project Alpha and Gamma');
      
      // Eve works on Project Beta
      await this.client.createEdge(personIds[4], projectIds[1], 'works_on', { since: '2024-03-01', role: 'analyst' });
      console.log('✅ Eve works_on Project Beta');
      
      // Create "knows" relationships between people
      await this.client.createEdge(personIds[0], personIds[1], 'knows', { since: '2020-01-01' });
      await this.client.createEdge(personIds[0], personIds[3], 'knows', { since: '2023-01-01' });
      await this.client.createEdge(personIds[1], personIds[2], 'knows', { since: '2022-06-01' });
      await this.client.createEdge(personIds[2], personIds[4], 'knows', { since: '2023-09-01' });
      console.log('✅ Created "knows" relationships');

      // Show graph statistics
      await this.showGraphStats();

      // Query demonstrations
      console.log('\n🔍 Query Demonstrations:');
      console.log('----------------------------------------');

      // Get all people
      console.log('\n📋 All People:');
      const allPeople = await this.client.getVerticesByLabel('person');
      console.table(allPeople.map(p => ({ id: p.id, ...p.properties })));

      // Get all projects
      console.log('\n📋 All Projects:');
      const allProjects = await this.client.getVerticesByLabel('project');
      console.table(allProjects.map(p => ({ id: p.id, ...p.properties })));

      // Get Alice's neighbors (people she knows and projects she works on)
      console.log('\n👥 Alice\'s connections:');
      const aliceNeighbors = await this.client.getNeighbors(personIds[0], 'out');
      console.log('People Alice knows and projects she works on:');
      console.table(aliceNeighbors.map(n => ({ id: n.id, label: n.label, ...n.properties })));

      // Get all "works_on" edges
      console.log('\n🔗 All "works_on" relationships:');
      const worksOnEdges = await this.client.getEdgesByLabel('works_on');
      console.table(worksOnEdges.map(e => ({ 
        id: e.id, 
        from: e.from, 
        to: e.to, 
        ...e.properties 
      })));

      // Update a vertex
      console.log('\n📝 Updating Alice\'s city...');
      await this.client.updateVertex(personIds[0], { city: 'Los Angeles' });
      const updatedAlice = await this.client.getVertexById(personIds[0]);
      console.log('Updated Alice:', updatedAlice);

      // Delete Eve
      console.log('\n🗑️  Deleting Eve...');
      await this.client.deleteVertex(personIds[4]);
      console.log('✅ Eve deleted');

      // Final statistics
      await this.showGraphStats();

    } catch (error) {
      console.error('❌ Error in demo operations:', error);
    }
  }

  private async showGraphStats(): Promise<void> {
    console.log('\n📊 Graph Statistics:');
    console.log('----------------------------------------');
    
    try {
      const vertexCount = await this.client.countVertices();
      const edgeCount = await this.client.countEdges();
      const personCount = await this.client.countVertices('person');
      const projectCount = await this.client.countVertices('project');
      const worksOnCount = await this.client.countEdges('works_on');
      const knowsCount = await this.client.countEdges('knows');
      const managesCount = await this.client.countEdges('manages');

      console.log(`📌 Total Vertices: ${vertexCount}`);
      console.log(`   - People: ${personCount}`);
      console.log(`   - Projects: ${projectCount}`);
      console.log(`🔗 Total Edges: ${edgeCount}`);
      console.log(`   - works_on: ${worksOnCount}`);
      console.log(`   - knows: ${knowsCount}`);
      console.log(`   - manages: ${managesCount}`);
    } catch (error) {
      console.error('❌ Error getting graph stats:', error);
    }
    
    console.log('----------------------------------------');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main function to start the Neptune client demo
 */
async function main() {
  // Configuration from environment variables
  const config: NeptuneConfig = {
    host: process.env.NEPTUNE_HOST || process.env.DB_HOST || '',
    port: parseInt(process.env.NEPTUNE_PORT || process.env.DB_PORT || '8182'),
    useSSL: (process.env.NEPTUNE_USE_SSL || process.env.USE_SSL || 'true').toLowerCase() === 'true',
    timeout: parseInt(process.env.NEPTUNE_TIMEOUT || process.env.DB_TIMEOUT || '30000')
  };

  // Validate required configuration
  if (!config.host) {
    console.error('❌ NEPTUNE_HOST or DB_HOST environment variable is required');
    console.error('   Example: neptune-example-cluster.cluster-xxxxx.us-east-1.neptune.amazonaws.com');
    process.exit(1);
  }

  console.log('🔧 Configuration:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   SSL: ${config.useSSL}`);
  console.log(`   Timeout: ${config.timeout}ms`);

  const client = new NeptuneClientDemo(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    await client.stop();
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    await client.stop();
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });

  // Start the client
  try {
    await client.start();
  } catch (error) {
    console.error('❌ Fatal error starting Neptune client:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}
