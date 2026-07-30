#!/bin/bash
export $(grep -v '^#' .env | xargs)
echo "Starting downloads..." >> runner.log
pnpm npm:fetch:downloads >> runner.log 2>&1
if [ $? -ne 0 ]; then echo "fetch:downloads failed" >> runner.log; exit 1; fi

echo "Starting report..." >> runner.log
pnpm npm:report >> runner.log 2>&1
if [ $? -ne 0 ]; then echo "report failed" >> runner.log; exit 1; fi

echo "Starting badges..." >> runner.log
pnpm npm:badges >> runner.log 2>&1
if [ $? -ne 0 ]; then echo "badges failed" >> runner.log; exit 1; fi

echo "Starting readme..." >> runner.log
pnpm npm:readme >> runner.log 2>&1
if [ $? -ne 0 ]; then echo "readme failed" >> runner.log; exit 1; fi

echo "Starting dump..." >> runner.log
pnpm db:dump >> runner.log 2>&1
if [ $? -ne 0 ]; then echo "db:dump failed" >> runner.log; exit 1; fi

echo "ALL DONE SUCCESSFULLY" >> runner.log
