const ONE_DAY_MS = 86400000;

KB.on('dom.ready', function () {
    function goToLink (selector) {
        if (! KB.modal.isOpen()) {
            var element = KB.find(selector);

            if (element !== null) {
                window.location = element.attr('href');
            }
        }
    }

    KB.onKey('v+g', function () {
        goToLink('a.view-gantt');
    });

    if (KB.exists('#gantt-chart')) {
        var chart = new Gantt();
        chart.show();
    }

    if (KB.exists('#gantt')) {
        const records = JSON.parse(KB.find('#gantt').attr('data-records'));

        const uniqueColors = Object.values(
            records
                .reduce((acc, curr) => 
                    Object.assign(acc, {[curr.color.name]: curr.color})
                , {})
        );

        const sanitizeColorName = name => name.replace(' ', '').toLowerCase()

        KB.find('#gantt').attr('style', 
            uniqueColors
                .reduce((acc, color) =>
                    `${acc} --color-${sanitizeColorName(color.name)}: ${color.background}; --border-color-${sanitizeColorName(color.name)}: ${color.border};`
                , '')
        )

        var checkBlockerStatus = (blocker, startDate) => {
            const blockerDueDate = Number(blocker.date_started)
                ? new Date(Number(blocker.date_started) * 1000) 
                : new Date(Date.now());
            
            return (startDate || Date.now()) < blockerDueDate;
        }

        const styleEl = document.createElement('style');
        document.head.appendChild(styleEl);
        updateStyles(styleEl, records, uniqueColors);

        function updateStyles(styleEl, records, uniqueColors) {
            styleEl.textContent = `${computeProblemStyles(records)} ${
                uniqueColors
                    .reduce((acc, curr) => `
                        ${acc}

                        #gantt .color-${sanitizeColorName(curr.name)} .bar-progress {
                            fill: var(--color-${sanitizeColorName(curr.name)});
                            stroke: var(--border-color-${sanitizeColorName(curr.name)});
                        }
                        
                    `, '')
            }`
        }

        function computeProblemStyles(records) {
            return records.reduce((acc, record) => {
                const { onBoardDependencies, offBoardDependencies } = getOnAndOffBoardDependencies(record, records)
                const { startDate } = getStartAndEndDate(record, onBoardDependencies, offBoardDependencies);
                const onBoardBlockers = onBoardDependencies
                    .filter(dep => checkBlockerStatus(dep, startDate));
                const offBoardBlockers = offBoardDependencies
                    .filter(dep => checkBlockerStatus(dep, startDate));

                if (onBoardBlockers.length || offBoardBlockers.length) {
                    acc += `
                        #gantt [data-id='${record.id}'] .bar-label {
                            fill: red;
                        }
                    `
                }
                
                if (onBoardBlockers.length) {
                    acc += onBoardBlockers
                        .map(blocker => `
                            #gantt .arrow [data-from="${blocker.task_id}"][data-to="${record.id}"] {
                                stroke: red;
                            }
                        `)
                        .join('')
                }

                if (record.date_due_not_defined || record.date_started_not_defined) {
                    acc += `
                        #gantt [data-id="${record.id}"] .bar-label {
                            fill: #bebebe;
                            font-style: italic;
                        }
                    `
                }

                return acc;
            }, '')
        } 

        function getOnAndOffBoardDependencies({internal_links}, records) {
            const [ onBoardDependencies, offBoardDependencies ] = (internal_links['is blocked by'] || [])
                .reduce(([on, off], link) =>
                    records.some(({id}) => id == link.task_id)
                        ? [[...on, link], off]
                        : [on, [...off, link]]
                , [[],[]]);

            return {onBoardDependencies, offBoardDependencies};
        }
        
        
        function getStartAndEndDate({
            start_time,
            end_time,
            date_started_not_defined,
            start,
            end,
            date_due_not_defined
         }, onBoardDependencies, offBoardDependencies) {
            
            const defaultStartTime = onBoardDependencies.reduce((acc, blocker) =>
                Math.max(acc, Number(blocker.date_due) * 1000)
            , new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime());

            const startTime = date_started_not_defined
                ? undefined
                : new Date(start[0], start[1] - 1, start[2]).getTime()//Number(start_time) * 1000;

            const defaultEndTime = defaultStartTime;

            const endTime = (date_due_not_defined
                ? undefined
                : Math.max(new Date(end[0], end[1] - 1, end[2]).getTime(), (startTime || defaultStartTime)) )// Math.max(Number(end_time) * 1000, (startTime || defaultStartTime)) );
                
            const startDate = new Date(startTime || defaultStartTime);
            const endDate = new Date(endTime || defaultEndTime);

            return { startDate, endDate };
        }

        const rows = records.map(record => {
            const {
                id, 
                title: name,
                start,
                end,
                color,
                score,
                progress,
                is_active,
                internal_links,
                date_started_not_defined,
                date_due_not_defined
            } = record;
            const { onBoardDependencies, offBoardDependencies } = getOnAndOffBoardDependencies(record, records);
            const { startDate, endDate } = getStartAndEndDate(record, onBoardDependencies, offBoardDependencies);
            
            return ({
                custom_class: `color-${sanitizeColorName(color.name)} ${Number(is_active) ? '' : 'task-closed'}`,
                id,
                name: `${name} ${score ? `(${score})` : ''}`,
                start: startDate,
                end: endDate,
                progress: Number(progress.replace('%', '')),
                dependencies: onBoardDependencies
                    ? onBoardDependencies.map(({task_id}) => task_id)
                    : []
            })
        })

        console.log(rows);

        console.log(records)

        window.rows = rows;

        var chart = new Gantt("#gantt",
            rows,
            {
                column_width: 10,
                // step: 100,
                padding: 10,
                bar_height: 15,
                bar_corner_radius: 1,
                view_mode: 'Day',
                custom_popup_html(task) {
                    const record = records.find(rec => task.id == rec.id)
                    return `
                        <div class="title">
                            <a href="${record.link}" class="gantt__popup-title">${record.title}</a>
                        </div>
                        <div class="subtitle">
                            <div class="gantt__popup-grid">
                                <div class="gantt__popup-dates">
                                    ${task.start.toLocaleDateString()} - ${task.end.toLocaleDateString()}
                                </div>
                                <div class="gantt__popup-assignee">
                                    <em>Assignee:</em> <span>${record.assignee}</span>
                                </div>
                                <div class="gantt__popup-score">
                                    <em>Complexity:</em> <span>${record.score}</span>
                                </div>
                                <div class="gantt__popup-column">
                                    <em>Column:</em> <span>${record.column_title}</span>
                                </div>
                                <h4>Internal Links</h4>
                                <div class="gantt__popup-links">
                                    ${
                                        Object.entries(record.internal_links)
                                            .map(([k,v]) => `
                                                <h4>${k}</h4>
                                                <ul>${
                                                    v.map(link =>`<li>${link.title}</li>`).join('')
                                                }</ul>
                                            `).join('')
                                    }
                                </div>
                            </div>
                        </div>
                        
                    `
                },
                on_date_change: function(task, ganttStart, ganttEnd, ganttPrevStart, ganttPrevEnd) {
                    ganttStart = new Date(ganttStart.getFullYear(), ganttStart.getMonth(), ganttStart.getDate());
                    ganttEnd = new Date(ganttEnd.getFullYear(), ganttEnd.getMonth(), ganttEnd.getDate());
                    // ganttStart = new Date(ganttStart - (ganttStart % ONE_DAY_MS));
                    // ganttEnd = new Date(ganttEnd - (ganttEnd % ONE_DAY_MS));
                    // ganttEnd = new Date(Math.round(ganttEnd / ONE_DAY_MS) * ONE_DAY_MS);
                    // ganttStart = new Date(Math.round(ganttStart / ONE_DAY_MS) * ONE_DAY_MS);
                    
                    const record = records.find(rec => task.id == rec.id)

                    const recordToSend = { id: task.id, start: ganttStart, end: ganttEnd };

                    record.start_time = (ganttStart / 1000).toString();
                    record.end_time = (ganttEnd / 1000).toString();
                    record.date_started_not_defined = false;
                    record.date_due_not_defined = false;

                    // const recordToSend = Object.assign({}, {id: record.id});

                    // const startDelta = Math.round((ganttPrevStart - ganttStart) / ONE_DAY_MS) * ONE_DAY_MS;
                    // const endDelta = Math.round((ganttPrevEnd - ganttEnd) / ONE_DAY_MS) * ONE_DAY_MS;

                    // // const newStart = [ganttStart.getUTCFullYear(), ganttStart.getUTCMonth(), ganttStart.getUTCDate(), ganttEnd.getUTCHours()];
                    // // const newEnd = [ganttEnd.getUTCFullYear(), ganttEnd.getUTCMonth(), ganttEnd.getUTCDate(), ganttEnd.getUTCHours()];
                    // debugger
                    // if (Math.abs(startDelta) >= ONE_DAY_MS) {
                    //     // recordToSend.start = new Date(Date.UTC(...newStart)).toISOString();
                    //     // recordToSend.start = new Date(Date.UTC(...record.start.map((v,k) => k === 1 ? v - 1 : v)) + startDelta).toISOString(); 
                       

                    //     const newStartDate = new Date((Number(record.start_time) * 1000) - startDelta);
                        
                    //     console.log('new start date', newStartDate, newStartDate % ONE_DAY_MS, [newStartDate.getUTCFullYear(), newStartDate.getUTCMonth() + 1, newStartDate.getUTCDate()])
                    //     console.log('prev start date', record.start);
                    //     record.start_time = (newStartDate / 1000).toString();//[newStartDate.getUTCFullYear(), newStartDate.getUTCMonth() + 1, newStartDate.getUTCDate()];
                    //     recordToSend.start = newStartDate;
                    //     record.date_started_not_defined = false;
                    //     // recordToSend.date_started_not_defined = false;
                    // }
                    
                    // if (Math.abs(endDelta) >= ONE_DAY_MS) {
                    //     const newEndDate = new Date((Number(record.end_time) * 1000) - endDelta);
                    //     console.log('new end date', newEndDate, newEndDate % ONE_DAY_MS,[newEndDate.getUTCFullYear(), newEndDate.getUTCMonth() + 1, newEndDate.getUTCDate()])
                    //     console.log('prev end date', record.end);
                    //     record.end_time = (newEndDate / 1000).toString();//[newEndDate.getUTCFullYear(), newEndDate.getUTCMonth() + 1, newEndDate.getUTCDate()];
                    //     recordToSend.end = newEndDate;
                    //     record.date_due_not_defined = false;
                    //     // recordToSend.date_due_not_defined = false;
                    // }

                    // console.log('sending record', recordToSend, 'prev record', record)


                    // start = [start.getFullYear(), start.getMonth() + 1, start.getDate()];
                    // end = [end.getFullYear(), end.getMonth() + 1, end.getDate()];

                    // console.log(record, start, end)
                    $.ajax({
                        cache: false,
                        url: $("#gantt").data("save-url"),
                        contentType: "application/json",
                        type: "POST",
                        processData: false,
                        data: JSON.stringify(recordToSend)
                    });

                    updateStyles(styleEl, records, uniqueColors);
                },
            }
        );
        
    }
});