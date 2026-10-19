import test from 'node:test';
import assert from 'node:assert';

class TestMaxHeap {
  constructor(items = []) {
    this.heap = [];
    items.forEach(item => this.push(item));
  }

  size() {
    return this.heap.length;
  }

  peek() {
    return this.heap[0] || null;
  }

  push(task) {
    if (['COMPLETED', 'CANCELLED', 'SNOOZED'].includes(task.status)) return;
    this.heap.push(task);
    this.bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop();
    const root = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.bubbleDown(0);
    return root;
  }

  remove(id) {
    const idx = this.heap.findIndex(t => t.id === id);
    if (idx === -1) return false;
    if (idx === this.heap.length - 1) {
      this.heap.pop();
      return true;
    }
    this.heap[idx] = this.heap.pop();
    this.bubbleDown(idx);
    this.bubbleUp(idx);
    return true;
  }

  bubbleUp(idx) {
    while (idx > 0) {
      const pIdx = Math.floor((idx - 1) / 2);
      if (this.heap[idx].priority_score > this.heap[pIdx].priority_score) {
        const tmp = this.heap[idx];
        this.heap[idx] = this.heap[pIdx];
        this.heap[pIdx] = tmp;
        idx = pIdx;
      } else {
        break;
      }
    }
  }

  bubbleDown(idx) {
    const len = this.heap.length;
    while (true) {
      let largest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < len && this.heap[left].priority_score > this.heap[largest].priority_score) {
        largest = left;
      }
      if (right < len && this.heap[right].priority_score > this.heap[largest].priority_score) {
        largest = right;
      }
      if (largest !== idx) {
        const tmp = this.heap[idx];
        this.heap[idx] = this.heap[largest];
        this.heap[largest] = tmp;
        idx = largest;
      } else {
        break;
      }
    }
  }
}

test('TaskPriorityQueue: peek() returns highest score in O(1)', () => {
  const heap = new TestMaxHeap([
    { id: '1', title: 'Task A', priority_score: 55, status: 'PENDING' },
    { id: '2', title: 'Task B', priority_score: 96, status: 'PENDING' },
    { id: '3', title: 'Task C', priority_score: 82, status: 'PENDING' }
  ]);

  assert.strictEqual(heap.peek().title, 'Task B');
  assert.strictEqual(heap.peek().priority_score, 96);
});

test('TaskPriorityQueue: pop() extracts tasks in descending order', () => {
  const heap = new TestMaxHeap([
    { id: '1', priority_score: 40, status: 'PENDING' },
    { id: '2', priority_score: 110, status: 'PENDING' },
    { id: '3', priority_score: 75, status: 'PENDING' },
    { id: '4', priority_score: 95, status: 'PENDING' }
  ]);

  assert.strictEqual(heap.pop().priority_score, 110);
  assert.strictEqual(heap.pop().priority_score, 95);
  assert.strictEqual(heap.pop().priority_score, 75);
  assert.strictEqual(heap.pop().priority_score, 40);
  assert.strictEqual(heap.pop(), null);
});

test('TaskPriorityQueue: ignores completed or snoozed tasks from queue', () => {
  const heap = new TestMaxHeap([
    { id: '1', priority_score: 120, status: 'COMPLETED' },
    { id: '2', priority_score: 70, status: 'PENDING' }
  ]);

  assert.strictEqual(heap.size(), 1);
  assert.strictEqual(heap.peek().id, '2');
});
