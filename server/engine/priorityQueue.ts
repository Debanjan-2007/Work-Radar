import { DbTask } from '../db/database.js';

/**
 * Binary Max Heap Priority Queue for Work Radar.
 * Provides O(1) peek() for "DO THIS NOW" and O(log N) insertion/removal.
 */
export class TaskPriorityQueue {
  private heap: DbTask[] = [];

  constructor(initialTasks: DbTask[] = []) {
    this.rebuild(initialTasks);
  }

  public size(): number {
    return this.heap.length;
  }

  public isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * O(1) peek at the highest-priority active task.
   */
  public peek(): DbTask | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Returns all tasks in sorted priority order without mutating heap.
   */
  public toSortedArray(): DbTask[] {
    return [...this.heap].sort((a, b) => {
      if (b.priority_score !== a.priority_score) {
        return b.priority_score - a.priority_score;
      }
      // Secondary sort: earlier deadline first
      if (a.deadline && b.deadline) {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      return a.deadline ? -1 : 1;
    });
  }

  /**
   * Inserts a task into the heap (O(log N)).
   */
  public push(task: DbTask): void {
    // Only pending or in-progress tasks enter the active priority queue
    if (['COMPLETED', 'CANCELLED', 'SNOOZED'].includes(task.status)) {
      return;
    }
    this.heap.push(task);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Removes and returns the highest priority task (O(log N)).
   */
  public pop(): DbTask | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop()!;

    const root = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return root;
  }

  /**
   * Removes a specific task by ID from the queue.
   */
  public remove(taskId: string): boolean {
    const index = this.heap.findIndex(t => t.id === taskId);
    if (index === -1) return false;

    if (index === this.heap.length - 1) {
      this.heap.pop();
      return true;
    }

    this.heap[index] = this.heap.pop()!;
    this.bubbleDown(index);
    this.bubbleUp(index);
    return true;
  }

  /**
   * Rebuilds the heap from active database records.
   */
  public rebuild(tasks: DbTask[]): void {
    this.heap = tasks.filter(t => !['COMPLETED', 'CANCELLED', 'SNOOZED'].includes(t.status));
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.bubbleDown(i);
    }
  }

  private compare(a: DbTask, b: DbTask): number {
    if (a.priority_score !== b.priority_score) {
      return a.priority_score - b.priority_score;
    }
    // If scores tie, task with sooner deadline has higher priority
    if (a.deadline && b.deadline) {
      return new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
    }
    return a.deadline ? 1 : -1;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index], this.heap[parentIndex]) > 0) {
        this.swap(index, parentIndex);
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      let largest = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < length && this.compare(this.heap[leftChild], this.heap[largest]) > 0) {
        largest = leftChild;
      }
      if (rightChild < length && this.compare(this.heap[rightChild], this.heap[largest]) > 0) {
        largest = rightChild;
      }

      if (largest !== index) {
        this.swap(index, largest);
        index = largest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
