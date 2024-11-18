// Performance monitoring utility
class PerformanceMonitor {
    constructor() {
        this.marks = new Map();
        this.measures = new Map();
        this.annotations = new Map();
    }

    // Start timing a specific operation
    mark(name) {
        const mark = performance.mark(name);
        this.marks.set(name, mark);
        return mark;
    }

    // End timing and measure duration
    measure(name, startMark, endMark) {
        const measure = performance.measure(name, startMark, endMark);
        this.measures.set(name, measure);
        return measure;
    }

    // Add annotation to a specific time range
    annotate(name, startTime, endTime, description) {
        this.annotations.set(name, {
            startTime,
            endTime,
            description
        });
    }

    // Get performance data for specific operation
    getMetrics(name) {
        return {
            mark: this.marks.get(name),
            measure: this.measures.get(name),
            annotation: this.annotations.get(name)
        };
    }

    // Clear all performance data
    clear() {
        performance.clearMarks();
        performance.clearMeasures();
        this.marks.clear();
        this.measures.clear();
        this.annotations.clear();
    }

    // Export performance data
    export() {
        return {
            marks: Array.from(this.marks.entries()),
            measures: Array.from(this.measures.entries()),
            annotations: Array.from(this.annotations.entries())
        };
    }
}

// Wait for GWEN object to be initialized
document.addEventListener('DOMContentLoaded', () => {
    if (!window.GWEN) {
        window.GWEN = {};
    }
    if (!window.GWEN.performance) {
        window.GWEN.performance = new PerformanceMonitor();
    }
});